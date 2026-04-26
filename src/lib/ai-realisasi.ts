import { BudgetComponent } from '../types/cost.types'
import { v4 as uuidv4 } from 'uuid'
import { useUsageStore, estimateTokens } from '../store/usageStore'

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
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  files?: Array<{ name: string; mimeType: string; base64Data: string }>
  newEntries?: RealisasiEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function extractEntriesFromText(text: string): { clean: string; entries: RealisasiEntry[] } {
  const jsonRegex = /```json\s*([\s\S]*?)```/
  const match = text.match(jsonRegex)
  let entries: RealisasiEntry[] = []
  let clean = text

  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const arr = Array.isArray(parsed) ? parsed : (parsed.transaksi || parsed.entries || [])
      if (Array.isArray(arr)) {
        entries = arr.map((item: any): RealisasiEntry => ({
          id: uuidv4(),
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
        }))
      }
    } catch (e) {
      console.error('[ai-realisasi] Gagal parsing JSON entries', e)
    }
    clean = text.replace(jsonRegex, '').trim()
  }
  return { clean, entries }
}

// ── System Instruction (Bisa belajar & menerima instruksi format) ─────────────

function buildSysInstruction(rabList: string): string {
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return `Kamu adalah **AI Asisten Keuangan Proyek Konstruksi** yang cerdas, teliti, dan adaptif.

Hari ini: ${today}

## PERAN & KEMAMPUAN UTAMA
Kamu bertugas membantu site manager / kontraktor merekap SEMUA pengeluaran lapangan menjadi laporan keuangan proyek yang rapi dan akurat. Kamu bisa:
1. Membaca foto nota / kuitansi / invoice / struk material (Gambar)
2. Membaca laporan atau rekening koran berformat PDF
3. Merekap dari teks biasa / form lisan
4. Belajar dari instruksi user: jika user minta format berbeda, sesuaikan.

**INSTRUKSI SPESIFIK JIKA MENERIMA FILE (GAMBAR/PDF):**
- Jika user mengirim lampiran dokumen/gambar, kamu **WAJIB** membedah, membaca, dan menganalisa semua baris item di dalamnya.
- Ekstrak secara teliti nama barang, qty (volume), harga satuan, dan total harga dari nota tersebut.
- Ekstrak nama supplier/toko dan nomor nota (jika ada) dari struktur visual dokumen.
- Pecah nota berukuran besar menjadi beberapa baris entry JSON secara mendetail.
- JANGAN HANYA MERANGKUM TOTALNYA SAJA, catat setiap item material atau upah agar bisa jadi laporan jelas.

## DUA JENIS CATATAN UTAMA

### 1. 📦 PEMBELIAN MATERIAL
Data wajib diisi: tanggal, nama material + spesifikasi, volume, satuan, harga satuan, nama supplier/toko, nomor nota (jika ada), total.
Contoh: "Beli Semen Portland Tipe I 50kg, 20 sak, @Rp58.000, total Rp1.160.000 dari Toko Bangunan Maju, nota #A123, 17 April"

### 2. 👷 UPAH TUKANG / PEKERJA
Data wajib diisi: tanggal, nama tukang/grup/mandor, jenis pekerjaan, jumlah orang, hari kerja, upah/orang/hari, total.
Contoh: "Upah cor beton kolom Lt.1, 4 tukang x 2 hari x Rp150.000 = Rp1.200.000"

## CARA MENJAWAB

### Langkah 1: Konfirmasi & Rangkum
Balas ramah dan tampilkan tabel rekap markdown. Jika dari file nota, tampilkan semuanya di tabel.

Untuk MATERIAL:
| Tgl | Material | Vol | Satuan | Harga/Satuan | Supplier | Total | Status |
|-----|----------|-----|--------|--------------|----------|-------|--------|

Untuk UPAH:
| Tgl | Nama Pekerja | Pekerjaan | Org | Hari | Upah/Org/Hari | Total | Status |
|-----|-------------|-----------|-----|------|---------------|-------|--------|

### Langkah 2: Tanya data yang kurang
Jika dari foto/teks ada info penting tidak terlihat (seperti nama toko/supplier atau harga total tidak sinkron), tanyakan secara sopan.

### Langkah 3: JSON HARUS ADA DI AKHIR PESAN
Lampirkan JSON transaksi HANYA di akhir pesan, dalam blok code json persis seperti contoh. Semua data yang terbaca dari PDF/Foto HARUS MASUK SINI.

\`\`\`json
[
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
]
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
async function callGemini(
  sysInstruction: string,
  history: ChatMessage[],
  newMessage: ChatMessage,
  model: string
): Promise<string> {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('No Gemini key')

  const contents = history
    .filter(h => !(h.role === 'assistant' && h.id === 'system-start'))
    .map(msg => {
      const textContent = msg.text?.trim() || (msg.files?.length ? '(Mengirim lampiran)' : '(Pesan kosong)')
      return { role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: textContent }] }
    })

  const newParts: any[] = [{ text: newMessage.text?.trim() || 'Analisis lampiran ini dan ekstrak semua transaksi.' }]
  for (const f of newMessage.files ?? []) {
    newParts.push({ inlineData: { data: f.base64Data, mimeType: f.mimeType } })
  }
  contents.push({ role: 'user', parts: newParts })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysInstruction }] },
        contents,
        generationConfig: { temperature: 0.15, maxOutputTokens: 8192 }
      })
    }
  )

  if (res.status === 429) throw new Error(`RATE_LIMIT:${model}`)
  if (res.status === 503) throw new Error(`OVERLOAD:${model}`)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${model} error: ${err.substring(0, 80)}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(`Gemini ${model} empty response`)
  return text
}

// ── OpenRouter Call ───────────────────────────────────────────────────────────
async function callOpenRouter(
  sysInstruction: string,
  history: ChatMessage[],
  newMessage: ChatMessage
): Promise<string> {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!key) throw new Error('No OpenRouter key')

  const messages: any[] = [{ role: 'system', content: sysInstruction }]
  for (const h of history.filter(h => !(h.role === 'assistant' && h.id === 'system-start'))) {
    const textContent = h.text?.trim() || (h.files?.length ? '(Mengirim lampiran)' : '(Pesan kosong)')
    messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: textContent })
  }
  messages.push({ role: 'user', content: newMessage.text?.trim() || 'Catat transaksi ini.' })

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key.trim()}` },
    body: JSON.stringify({ model: 'meta-llama/llama-4-scout:free', messages, temperature: 0.15, max_tokens: 3000 })
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter empty response')
  return text
}

// ── Groq Call (multi-model, hemat token) ─────────────────────────────────────
async function callGroq(
  sysInstruction: string,
  history: ChatMessage[],
  newMessage: ChatMessage
): Promise<string> {
  const key = import.meta.env.VITE_GROQ_API_KEY
  if (!key) throw new Error('No Groq key')

  const messages: any[] = [{ role: 'system', content: sysInstruction.substring(0, 2000) }]
  for (const h of history.filter(h => !(h.role === 'assistant' && h.id === 'system-start')).slice(-4)) {
    const textContent = h.text?.trim() || (h.files?.length ? '(Mengirim lampiran)' : '(Pesan kosong)')
    messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: textContent.substring(0, 500) })
  }
  messages.push({ role: 'user', content: (newMessage.text?.trim() || 'Catat transaksi ini.').substring(0, 1000) })

  const models = ['gemma2-9b-it', 'llama-3.1-8b-instant', 'llama3-8b-8192']
  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key.trim()}` },
        body: JSON.stringify({ model, messages, temperature: 0.15, max_tokens: 1500 })
      })
      if (res.status === 429) { console.warn(`[Groq] ${model} rate limited`); continue }
      if (!res.ok) throw new Error(`Groq ${model} HTTP ${res.status}`)
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content
      if (text) return text
    } catch (e: any) {
      if (!e.message?.includes('rate')) throw e
    }
  }
  throw new Error('Semua model Groq kena rate limit')
}

// ── Token Usage Helper ────────────────────────────────────────────────────────
function trackUsage(provider: 'gemini'|'groq'|'openrouter', model: string, inputText: string, outputText: string) {
  try {
    const { recordUsage } = useUsageStore.getState()
    recordUsage({
      feature: 'realisasi_chat',
      provider,
      model,
      inputTokens:  estimateTokens(inputText),
      outputTokens: estimateTokens(outputText),
    })
  } catch { /* tracking failure should never break the main flow */ }
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export async function chatRealisasiWithGemini(
  newMessage: ChatMessage,
  history: ChatMessage[],
  rabComponents: BudgetComponent[]
): Promise<{ textResponse: string; parsedEntries: RealisasiEntry[] }> {
  const rabList = rabComponents.map(c => `${c.id}|${c.name}|${c.categoryId}|Rp${c.totalPlannedCost}`).join('\n')
  const sysInstruction = buildSysInstruction(rabList)
  const hasImages = (newMessage.files?.length ?? 0) > 0

  const errors: string[] = []
  const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
  const inputContext  = sysInstruction + (newMessage.text ?? '')

  for (const model of geminiModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await callGemini(sysInstruction, history, newMessage, model)
        trackUsage('gemini', model, inputContext, raw) // ← record usage
        const { clean, entries } = extractEntriesFromText(raw)
        return { textResponse: clean, parsedEntries: entries }
      } catch (e: any) {
        const isRL = e.message?.includes('RATE_LIMIT') || e.message?.includes('429')
        const isOL = e.message?.includes('OVERLOAD') || e.message?.includes('503')
        errors.push(`${model}[${attempt}]: ${isRL ? 'Rate Limit' : isOL ? 'Overload' : e.message}`)
        if (attempt < 2) await sleep(isRL ? 7000 : 3000)
      }
    }
    if (model !== geminiModels[geminiModels.length - 1]) await sleep(2000)
  }

  if (!hasImages) {
    try {
      const raw = await callOpenRouter(sysInstruction, history, newMessage)
      trackUsage('openrouter', 'meta-llama/llama-4-scout:free', inputContext, raw)
      const { clean, entries } = extractEntriesFromText(raw)
      return { textResponse: '*(via OpenRouter)*\n\n' + clean, parsedEntries: entries }
    } catch (e: any) { errors.push(`OpenRouter: ${e.message}`) }

    try {
      const raw = await callGroq(sysInstruction, history, newMessage)
      trackUsage('groq', 'llama-3.1-8b-instant', inputContext, raw)
      const { clean, entries } = extractEntriesFromText(raw)
      return { textResponse: '*(via Groq)*\n\n' + clean, parsedEntries: entries }
    } catch (e: any) { errors.push(`Groq: ${e.message}`) }

    throw new Error(
      'Semua layanan AI sedang penuh. Coba kirim ulang dalam 1-2 menit ya! 🙏\n\n' +
      '*Tip: Tanpa foto, AI akan lebih cepat merespons.*\n\n' +
      `<!-- Debug: ${errors.join(' | ')} -->`
    )
  }

  // Ada gambar tapi semua Gemini gagal
  console.error('[AI Realisasi] All providers failed:', errors)
  throw new Error(
    'Layanan AI untuk membaca gambar sedang sangat sibuk saat ini.\n\n' +
    'Silakan coba lagi dalam ±1 menit, atau ketik isi nota secara manual. 🙏\n\n' +
    `<!-- Debug: ${errors.join(' | ')} -->`
  )
}
