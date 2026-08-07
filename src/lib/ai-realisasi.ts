import { BudgetComponent } from '../types/cost.types'
import { v4 as uuidv4 } from 'uuid'
import { parsePemasukan, parsePembayaran } from './rencanaCatat'
import { jenisGalat, bisaDiulang, ringkasGalatAi } from './galatAi'
import { diagnosaAi, ceritaDiagnosa, pesanPenyedia, type Diagnosa } from './diagnosaAi'
import { useAuthStore } from '../store/authStore'
import { pengelompokNama } from './namaMaterial'
import { useUsageStore, estimateTokens } from '../store/usageStore'
import { MODEL_TEKS } from './modelAi'
import { panggilGemini } from './gemini'
import { buatAnggaran, pantasDicobaLagi, WAKTU_HABIS } from './anggaranWaktu'
import { riwayatUntukModel } from './riwayatChat'

// ── Data Structures ───────────────────────────────────────────────────────────

/**
 * Entry tunggal pengeluaran/transaksi.
 * Mendukung 2 tipe utama: 'material' dan 'upah', plus kategori bebas lainnya.
 */
export interface RealisasiEntry {
  id: string
  tipe: 'material' | 'upah' | 'operasional' | 'lainnya'
  tanggal: string            // format: YYYY-MM-DD

  // === MATERIAL ===
  namaMaterial?: string      // e.g. "Semen Portland Tipe I 50kg"
  volume?: number            // qty e.g. 50
  satuan?: string            // e.g. "sak", "m3", "kg", "lembar"
  hargaSatuan?: number       // harga per satuan
  namaSupplier?: string      // nama toko / supplier
  nomorNota?: string         // nomor nota / invoice

  // === UPAH TUKANG ===
  namaTukang?: string        // nama pekerja / mandor / grup
  jenisKerja?: string        // jenis pekerjaan e.g. "Cor beton kolom lt.1"
  jumlahOrang?: number       // jumlah tenaga kerja
  hariKerja?: number         // durasi
  upahHarian?: number        // upah per orang per hari

  // === COMMON ===
  keterangan: string         // deskripsi singkat / bebas
  kategori: string           // bangunan / infrastruktur / lahan / operasional / marketing / lainnya
  jumlah: number             // total nominal (integer)
  status: string             // ✅ Dicatat / 🔄 Kasbon / ⏳ Belum Lunas
  metodePembayaran?: string  // Cash / Transfer / Bon
  linkedComponentId?: string // ID item RAB yang terkait
  /**
   * Diisi bila nota ini sudah dicatat sekaligus sebagai penerimaan barang.
   * Entri seperti itu tetap menjadi BIAYA, tetapi tidak lagi menambah stok:
   * yang menambah stok adalah surat jalannya, dan menghitung keduanya berarti
   * satu kiriman masuk gudang dua kali.
   */
  doId?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  files?: Array<{ name: string; mimeType: string; base64Data: string }>
  newEntries?: RealisasiEntry[]
  updatedEntries?: { id: string; data: Partial<RealisasiEntry> }[]
  deletedEntryIds?: string[]
  /**
   * Gelembung ini lahir dari sebuah galat, bukan dari jawaban AI.
   *
   * Dipakai untuk menahannya keluar dari riwayat yang dikirim balik ke model.
   */
  galat?: boolean
}

/**
 * Uang MASUK yang terbaca dari percakapan/dokumen. Tempatnya bukan di
 * Realisasi Biaya melainkan di Akuntan → Pemasukan, dan selama ini satu-satunya
 * jalan ke sana adalah mengetik manual.
 */
export interface PemasukanUsul {
  tanggal: string
  sumber: string
  kategori: 'termin' | 'penjualan' | 'modal' | 'lainnya'
  jumlah: number
  keterangan?: string
}

/**
 * Bukti pembayaran ke vendor. Tempatnya di Akuntan → Hutang Vendor, menempel
 * pada PO-nya. Nomor PO sering tidak tertulis di bukti transfer, jadi vendor
 * dan jumlahnya ikut dibawa untuk dicocokkan.
 */
export interface PembayaranUsul {
  tanggal: string
  nomorPo?: string
  vendor?: string
  jumlah: number
  metode: 'transfer' | 'tunai' | 'giro' | 'lainnya'
  referensi?: string
  catatan?: string
}

export interface RealisasiParsedResult {
  clean: string;
  added: RealisasiEntry[];
  updated: { id: string; data: Partial<RealisasiEntry> }[];
  deleted: string[];
  /** Uang masuk — dicatat ke Akuntan, bukan ke Realisasi Biaya. */
  pemasukan: PemasukanUsul[];
  /** Bukti bayar ke vendor — dicatat ke Hutang Vendor. */
  pembayaran: PembayaranUsul[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function parseEntry(item: any): RealisasiEntry {
  return {
    id: item.id || uuidv4(),
    tipe: item.tipe || (['upah','operasional','lainnya'].includes(item.tipe) ? item.tipe : 'material'),
    tanggal: item.tanggal || new Date().toISOString().split('T')[0],
    namaMaterial: item.namaMaterial || undefined,
    volume: item.volume ? Number(item.volume) : undefined,
    satuan: item.satuan || undefined,
    hargaSatuan: item.hargaSatuan ? Number(item.hargaSatuan) : undefined,
    namaSupplier: item.namaSupplier || item.supplier || undefined,
    nomorNota: item.nomorNota || undefined,
    namaTukang: item.namaTukang || undefined,
    jenisKerja: item.jenisKerja || undefined,
    jumlahOrang: item.jumlahOrang ? Number(item.jumlahOrang) : undefined,
    hariKerja: item.hariKerja ? Number(item.hariKerja) : undefined,
    upahHarian: item.upahHarian ? Number(item.upahHarian) : undefined,
    keterangan: item.keterangan || item.pekerjaan || '-',
    kategori: item.kategori || 'bangunan',
    jumlah: Number(item.jumlah) || 0,
    status: item.status || '✅ Dicatat',
    metodePembayaran: item.metodePembayaran || 'Cash',
    linkedComponentId: item.linkedComponentId || undefined,
    doId: item.doId || undefined,
  }
}

function extractEntriesFromText(text: string): RealisasiParsedResult {
  const jsonRegex = /```json\s*([\s\S]*?)```/
  const match = text.match(jsonRegex)
  let added: RealisasiEntry[] = []
  let updated: { id: string; data: Partial<RealisasiEntry> }[] = []
  let deleted: string[] = []
  let pemasukan: PemasukanUsul[] = []
  let pembayaran: PembayaranUsul[] = []
  let clean = text

  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim())
      
      // Handle backward compatibility or AI fail (direct array)
      if (Array.isArray(parsed)) {
        added = parsed.map(parseEntry)
      } else {
        // Handle object with actions
        if (Array.isArray(parsed.added)) added = parsed.added.map(parseEntry)
        if (Array.isArray(parsed.updated)) updated = parsed.updated
        if (Array.isArray(parsed.deleted)) deleted = parsed.deleted
        
        // Fallback for older structure
        if (Array.isArray(parsed.transaksi)) added = parsed.transaksi.map(parseEntry)
        if (Array.isArray(parsed.entries)) added = parsed.entries.map(parseEntry)

        // Uang masuk & bukti bayar hanya diambil kalau nominalnya jelas —
        // baris tanpa angka bukan transaksi, melainkan basa-basi.
        if (Array.isArray(parsed.pemasukan)) {
          pemasukan = parsed.pemasukan.map(parsePemasukan).filter((p: PemasukanUsul) => p.jumlah > 0)
        }
        if (Array.isArray(parsed.pembayaran)) {
          pembayaran = parsed.pembayaran.map(parsePembayaran).filter((p: PembayaranUsul) => p.jumlah > 0)
        }
      }
    } catch (e) {
      console.error('[ai-realisasi] Gagal parsing JSON entries', e)
    }
    clean = text.replace(jsonRegex, '').trim()
  }
  return { clean, added, updated, deleted, pemasukan, pembayaran }
}

// ── System Instruction (Bisa belajar & menerima instruksi format) ─────────────

function buildSysInstruction(rabList: string, currentEntriesList: string, daftarMaterial: string): string {
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return `Kamu adalah **AI Asisten Keuangan Proyek Konstruksi** yang cerdas, teliti, dan adaptif.

Hari ini: ${today}

## PERAN & KEMAMPUAN UTAMA
Kamu bertugas membantu site manager / kontraktor merekap SEMUA pengeluaran lapangan menjadi laporan keuangan proyek yang rapi dan akurat. Kamu bisa:
1. Membaca foto nota / kuitansi / invoice / struk material (Gambar)
2. Membaca laporan atau rekening koran berformat PDF
3. Merekap dari teks biasa / form lisan
4. Belajar dari instruksi user: jika user minta format berbeda, sesuaikan.
5. **MENGUBAH / MENGHAPUS** data transaksi yang sudah dicatat sebelumnya jika user memintanya (Revisi).

**INSTRUKSI SPESIFIK JIKA MENERIMA FILE (GAMBAR/PDF):**
- Jika user mengirim lampiran dokumen/gambar, kamu **WAJIB** membedah, membaca, dan menganalisa semua baris item di dalamnya.
- Ekstrak secara teliti nama barang, qty (volume), harga satuan, dan total harga dari nota tersebut.
- Ekstrak nama supplier/toko dan nomor nota (jika ada) dari struktur visual dokumen.
- Pecah nota berukuran besar menjadi beberapa baris entry JSON secara mendetail.
- JANGAN HANYA MERANGKUM TOTALNYA SAJA, catat setiap item material atau upah agar bisa jadi laporan jelas.

## DAFTAR TRANSAKSI SAAT INI (REALISASI)
Berikut adalah daftar transaksi yang SUDAH dicatat di sistem saat ini. Jika user meminta revisi atau penghapusan, cari ID transaksi yang relevan dari daftar ini:
${currentEntriesList}

## CARA MENJAWAB

### Langkah 1: Konfirmasi & Rangkum
Balas ramah dan tampilkan tabel rekap markdown. Jika dari file nota, tampilkan semuanya di tabel.

### Langkah 2: Tanya data yang kurang
Jika dari foto/teks ada info penting tidak terlihat (seperti nama toko/supplier atau harga total tidak sinkron), tanyakan secara sopan.

### Langkah 3: JSON HARUS ADA DI AKHIR PESAN
Lampirkan JSON transaksi HANYA di akhir pesan, dalam blok code json persis seperti contoh. Semua data yang terbaca dari PDF/Foto HARUS MASUK SINI.

Jika mencatat transaksi BARU, masukkan ke dalam array \`added\`.
Jika MENGUBAH transaksi yang sudah ada (revisi), masukkan ke \`updated\` dengan mencantumkan "id" transaksi tersebut.
Jika MENGHAPUS transaksi, masukkan "id" nya ke array \`deleted\`.

PENTING — SATU BARANG, SATU NAMA:
Berikut material yang SUDAH pernah tercatat di proyek ini:
${daftarMaterial}

Kalau barang di nota adalah barang yang SAMA dengan salah satu di atas, pakai
**persis nama yang sudah ada** — jangan menuliskan variannya. Stok dihitung per
nama, jadi "Triplek 9mm Pku" dan "Triplek 9mm Pku @130lmbr/pallet" akan terbaca
sebagai dua barang berbeda dan stoknya terbagi dua.

Keterangan kemasan, isi per pallet, merek toko, dan harga JANGAN dimasukkan ke
\`namaMaterial\`. Tempatnya di \`keterangan\`. Nama material hanya berisi jenis,
ukuran, dan mutu barangnya — itu saja yang membedakan satu barang dari yang lain.

Barang yang benar-benar BEDA ukuran atau mutu tetap ditulis terpisah:
"Besi Beton 10mm" dan "Besi Beton 12mm" bukan barang yang sama.

PENTING — TIGA JENIS UANG, TIGA TEMPAT BERBEDA:
1. Uang KELUAR untuk proyek (beli material, upah, operasional) → array \`added\`.
2. Uang MASUK (termin dari owner, penjualan unit, modal disetor, pinjaman) → array \`pemasukan\`.
   JANGAN pernah menaruh uang masuk di \`added\`; \`added\` hanya untuk pengeluaran.
3. BUKTI PEMBAYARAN ke vendor/supplier (bukti transfer, kuitansi pelunasan nota
   yang SUDAH pernah dicatat) → array \`pembayaran\`. Ini melunasi hutang, bukan
   biaya baru. Kalau dokumennya bukti transfer, JANGAN juga menaruhnya di
   \`added\` — nanti biayanya terhitung dua kali.
   Sebutkan \`nomorPo\` bila tertulis; kalau tidak ada, isi \`vendor\` saja.

\`\`\`json
{
  "added": [
    {
      "tipe": "material",
      "tanggal": "2026-04-17",
      "namaMaterial": "Semen Portland Tipe I 50kg",
      "volume": 20,
      "satuan": "sak",
      "hargaSatuan": 58000,
      "namaSupplier": "Toko Bangunan Maju",
      "nomorNota": "A123",
      "keterangan": "Pembelian semen untuk kolom Lt.1",
      "kategori": "bangunan",
      "jumlah": 1160000,
      "status": "✅ Dicatat",
      "metodePembayaran": "Cash"
    }
  ],
  "updated": [
    {
      "id": "contoh-id-transaksi-123",
      "data": {
        "jumlah": 1000000,
        "keterangan": "Revisi pembelian semen"
      }
    }
  ],
  "deleted": [
    "contoh-id-transaksi-456"
  ],
  "pemasukan": [
    {
      "tanggal": "2026-04-20",
      "sumber": "Termin 2 Ruko Blok A",
      "kategori": "termin",
      "jumlah": 250000000,
      "keterangan": "Transfer dari owner"
    }
  ],
  "pembayaran": [
    {
      "tanggal": "2026-04-21",
      "nomorPo": "PO/001/04/2026",
      "vendor": "Toko Bangunan Maju",
      "jumlah": 5000000,
      "metode": "transfer",
      "referensi": "TRF-99881",
      "catatan": "Pelunasan nota A123"
    }
  ]
}
\`\`\`

## ATURAN PENTING
- Jumlah = angka integer, TANPA titik/koma ribuan (1160000 bukan 1.160.000)
- Tipe valid: "material" | "upah" | "operasional" | "lainnya"  
- Kategori valid: bangunan / infrastruktur / lahan / operasional / marketing / lainnya
- Status valid: "✅ Dicatat" | "🔄 Kasbon (Belum Lunas)" | "⏳ Menunggu Konfirmasi"
- JANGAN tampilkan blok JSON di tengah paragraf percakapan. Ingat, JSON SELALU PALING AKHIR.

## REFERENSI RAB PROYEK (untuk rujukan kategori)
${rabList.substring(0, 3000)}`
}

// ── Gemini Call ───────────────────────────────────────────────────────────────

/**
 * Galat yang masih membawa bahan diagnosisnya.
 *
 * Sebelumnya status dan badan respons dilebur menjadi satu string, lalu string
 * itu dipangkas — sehingga kalimat Google yang menyebut perbaikannya ("Requests
 * from referer … are blocked", "… has not been used in project …") ikut hilang
 * sebelum ada yang sempat membacanya. Yang tersisa di layar cuma "403".
 */
class GalatGemini extends Error {
  constructor(readonly status: number, readonly badan: string, readonly model: string) {
    super(`${model}: HTTP ${status} ${pesanPenyedia(badan).substring(0, 200)}`)
    this.name = 'GalatGemini'
  }
}

async function callGemini(
  sysInstruction: string,
  history: ChatMessage[],
  newMessage: ChatMessage,
  model: string,
  batasMs: number,
): Promise<string> {
  // Tidak ada lagi kunci yang bisa diperiksa dari sini — dan itulah
  // perbaikannya. Bila kunci server belum dipasang, /api/ai menjawabnya sendiri
  // dengan kalimat yang jelas.

  // Gelembung galat TIDAK ikut dikirim. Ia tampilan, bukan percakapan — dan
  // bila ikut, model membacanya sebagai ucapannya sendiri lalu meneruskan
  // peran itu: menolak membaca foto sambil menyebut kuota, meski permintaan
  // barusan berhasil.
  const contents = riwayatUntukModel(history)
    .map(msg => {
      const textContent = msg.text?.trim() || (msg.files?.length ? '(Mengirim lampiran)' : '(Pesan kosong)')
      return { role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: textContent }] }
    })

  const newParts: any[] = [{ text: newMessage.text?.trim() || 'Analisis lampiran ini dan ekstrak semua transaksi.' }]
  for (const f of newMessage.files ?? []) {
    newParts.push({ inlineData: { data: f.base64Data, mimeType: f.mimeType } })
  }
  contents.push({ role: 'user', parts: newParts })

  const res = await panggilGemini(model, {
    systemInstruction: { parts: [{ text: sysInstruction }] },
    contents,
    generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
  }, batasMs)

  // Badan respons TIDAK dipangkas di sini. Di dalamnya persis terletak kalimat
  // yang menyebutkan perbaikannya; yang menyaring apa yang boleh sampai ke
  // layar adalah pemanggilnya, bukan tempat galatnya lahir.
  if (!res.ok) throw new GalatGemini(res.status, await res.text().catch(() => ''), model)

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new GalatGemini(0, 'empty response', model)
  return text
}

// Penyedia cadangan (OpenRouter & Groq) sudah dihapus dari jalur ini.
//
// Keduanya bukan cadangan lagi, melainkan dua kegagalan tambahan yang pasti:
// model gratis OpenRouter menjawab 404 karena setelan privasi akunnya menutup
// akses, dan model Groq yang terdaftar di sini sudah dihentikan sehingga
// menjawab 400. Mempertahankannya hanya menambah dua panggilan yang dijamin
// gagal pada setiap pesan, memperlambat kabar buruknya sampai ke pemakai, dan
// menutupi sebab yang sebenarnya di balik daftar galat yang panjang.
//
// Lagi pula keduanya melayani teks saja, sedangkan yang paling dipakai di sini
// adalah membaca foto nota — yang memang hanya bisa lewat Gemini. Jadi
// "cadangan" itu tidak pernah benar-benar menggantikan apa pun.

// ── Token Usage Helper ────────────────────────────────────────────────────────
function trackUsage(model: string, inputText: string, outputText: string) {
  try {
    const { recordUsage } = useUsageStore.getState()
    recordUsage({
      feature: 'realisasi_chat',
      provider: 'gemini',
      model,
      inputTokens:  estimateTokens(inputText),
      outputTokens: estimateTokens(outputText),
    })
  } catch { /* tracking failure should never break the main flow */ }
}

/**
 * Anggaran untuk SELURUH pembacaan satu pesan, dan jatah untuk satu percobaan.
 *
 * Totalnya sengaja di bawah dua kali jatah tunggal: dengan begitu percobaan
 * kedua hanya berjalan bila yang pertama gagal cepat, bukan bila ia berjalan
 * lambat sampai habis. Yang lambat tidak menjadi cepat karena diulang.
 */
const BATAS_TOTAL_MS = 70_000
const BATAS_SATU_MS = 45_000

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export async function chatRealisasiWithGemini(
  newMessage: ChatMessage,
  history: ChatMessage[],
  rabComponents: BudgetComponent[],
  currentEntries: RealisasiEntry[]
): Promise<{ textResponse: string; parsedResult: RealisasiParsedResult }> {
  // Titik sisip untuk uji E2E: alur penyambung nota → PO diuji tanpa memanggil
  // Gemini sungguhan, supaya hasilnya pasti dan tidak menghabiskan kuota.
  const tiruan = (globalThis as { __aiRealisasiMock?: typeof chatRealisasiWithGemini }).__aiRealisasiMock
  if (tiruan) return await tiruan(newMessage, history, rabComponents, currentEntries)

  const rabList = rabComponents.map(c => `${c.id}|${c.name}|${c.categoryId}|Rp${c.totalPlannedCost}`).join('\n')
  
  const currentEntriesList = currentEntries.length === 0 
    ? '(Belum ada transaksi dicatat)' 
    : currentEntries.map(e => `[ID: ${e.id}] Tgl: ${e.tanggal} | Rp${e.jumlah} | ${e.keterangan}`).join('\n')

  // Nama material yang SUDAH dipakai proyek ini. Diberikan ke AI supaya ia
  // memakai ulang nama yang ada alih-alih melahirkan varian baru — satu barang
  // dengan dua nama membuat stoknya terbagi dan tidak ada yang benar.
  const kelompokNama = pengelompokNama(
    currentEntries.filter(e => e.tipe === 'material').map(e => e.namaMaterial || e.keterangan || ''),
  )
  const namaTerpakai = [...new Set(
    currentEntries
      .filter(e => e.tipe === 'material' && (e.namaMaterial || '').trim())
      .map(e => kelompokNama.tampilan(e.namaMaterial ?? '')),
  )]
  const daftarMaterial = namaTerpakai.length === 0
    ? '(Belum ada material tercatat)'
    : namaTerpakai.map(n => `- ${n}`).join('\n')

  const sysInstruction = buildSysInstruction(rabList, currentEntriesList, daftarMaterial)
  const hasImages = (newMessage.files?.length ?? 0) > 0

  const errors: string[] = []
  const geminiModels = MODEL_TEKS
  const inputContext  = sysInstruction + (newMessage.text ?? '')

  // Kegagalan yang tidak akan membaik — kunci ditolak, kuota habis — membatalkan
  // seluruh sisa upaya. Mengulanginya empat kali dengan jeda hanya menghabiskan
  // delapan detik untuk menunggu jawaban yang sudah pasti sama.
  // SATU anggaran untuk seluruh pekerjaan, bukan satu batas per panggilan.
  //
  // Batas per panggilan tidak menghentikan apa pun ketika pemanggilnya punya
  // perulangan: tiap pemutusan dibaca sebagai gangguan jaringan, lalu diulang,
  // masing-masing dengan batas penuh lagi. Empat percobaan × 75 detik menjadi
  // lima menit menunggu — pengaman yang justru melipatgandakan penungguan.
  const anggaran = buatAnggaran(BATAS_TOTAL_MS)

  let berhenti = false
  // Penolakan terakhir disimpan utuh — dialah satu-satunya yang masih membawa
  // kalimat Google, dan kalimat itulah yang menyebutkan perbaikannya.
  let terakhir: GalatGemini | null = null

  for (const model of geminiModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      // Percobaan yang tidak muat lagi dalam anggaran tidak dijalankan: ia
      // sudah pasti terputus di tengah jalan, dan hanya menambah waktu tunggu
      // sebelum pesan gagal yang sama.
      if (!pantasDicobaLagi(anggaran)) { berhenti = true; break }
      try {
        const raw = await callGemini(
          sysInstruction, history, newMessage, model, anggaran.jatah(BATAS_SATU_MS),
        )
        trackUsage(model, inputContext, raw) // ← record usage
        const parsedResult = extractEntriesFromText(raw)
        return { textResponse: parsedResult.clean, parsedResult }
      } catch (e: any) {
        errors.push(`${model}[${attempt}]: ${e?.message ?? e}`)
        if (e instanceof GalatGemini) terakhir = e
        const jenis = jenisGalat(e)
        if (!bisaDiulang(jenis) || jenis === 'waktu') { berhenti = true; break }
        if (attempt < 2) await sleep(jenis === 'sibuk' ? 3000 : 2000)
      }
    }
    if (berhenti || !pantasDicobaLagi(anggaran)) break
    if (model !== geminiModels[geminiModels.length - 1]) await sleep(2000)
  }

  // Anggaran habis tanpa satu pun jawaban: katakan apa adanya, dengan angka
  // yang bisa dibandingkan pemakainya dengan penghitung di layarnya.
  if (anggaran.habis() && !errors.some(e => /waktu_habis/i.test(String(e)))) {
    errors.push(`anggaran: ${WAKTU_HABIS} setelah ${BATAS_TOTAL_MS / 1000} detik`)
  }

  // Satu tempat menyusun pesan kegagalan, supaya penyebab yang berbeda tidak
  // lagi diberi kalimat yang sama. Rincian mentahnya HANYA ke console —
  // sebelumnya ia ikut tercetak di gelembung chat lewat `<!-- Debug: … -->`
  // yang dikira komentar HTML tak terlihat.
  const superadmin = superadminSaatIni()
  const ringkas = ringkasGalatAi(errors, { adaGambar: hasImages, superadmin })
  const dg: Diagnosa | null = terakhir ? diagnosaAi(terakhir.status, terakhir.badan) : null

  console.error('[AI Realisasi] Gemini gagal:', ringkas.jenis, dg?.sebab ?? '-', errors)

  // Superadmin diberi diagnosis lengkap beserta kalimat asli Google. Dialah
  // yang bisa membetulkannya, dan tanpa kalimat itu ia hanya bisa menebak
  // di antara empat sebab yang semuanya berbunyi 403.
  if (superadmin && dg && dg.sisiKami) {
    // Tanpa ikon: ChatAiPage sudah menambahkannya sendiri untuk setiap galat.
    // Menambahkan di sini juga membuat "⚠️ ⚠️" tercetak di gelembung chat.
    throw new Error(ceritaDiagnosa(dg))
  }
  throw new Error(ringkas.pesan)
}

/**
 * Apakah yang memakai sekarang superadmin.
 *
 * Hanya dia yang diberi satu baris rincian teknis: bagi pemakai biasa, kode
 * galat bukan keterangan melainkan kebisingan — dan tidak ada yang bisa ia
 * lakukan dengannya.
 */
function superadminSaatIni(): boolean {
  try { return useAuthStore.getState().profile?.role === 'superadmin' } catch { return false }
}
