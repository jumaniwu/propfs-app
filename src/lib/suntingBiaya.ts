// ============================================================
// PropFS — Memperbaiki baris biaya yang salah ketik
//
// Dua cacat yang bertemu, dan bersama-sama menghasilkan keluhan "sudah saya
// suruh perbaiki tapi tidak ke-save".
//
// PERTAMA: satu-satunya cara mengubah sebuah baris adalah menyuruh AI. Kartu
// biaya di daftar tidak punya tombol sunting sama sekali. Ketika AI-nya keliru,
// tidak ada jalan lain — pemakainya mengulang kalimat yang sama dengan harapan
// kali ini dimengerti.
//
// KEDUA, yang lebih buruk: perubahan dari AI diterima MENTAH-MENTAH. Baris
// `added` melewati `parseEntry` yang memaksa angkanya menjadi Number; baris
// `updated` tidak melewati apa pun. Dua akibatnya:
//
//   • AI menyebut id yang tidak ada di daftar → `map` tidak menemukan apa-apa,
//     tidak ada yang berubah, TIDAK ADA GALAT — dan notifikasinya tetap
//     berbunyi "✅ 5 perubahan dicatat". Persis yang dilihat pemakainya.
//
//   • AI menulis nominal sebagai TEKS "135.000". `Number("135.000")` = 135,
//     karena JavaScript membaca titik itu sebagai koma desimal. Rp 135 ribu
//     tersimpan sebagai Rp 135 — dan inilah "nominal kurang ribuan" itu.
//
// Modul ini menutup keduanya: setiap perubahan dibersihkan sebelum dipakai,
// dan yang dilaporkan hanya yang BENAR-BENAR berubah.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()

/**
 * Angka rupiah dari tulisan orang Indonesia.
 *
 * `Number()` saja tidak cukup, dan bukan karena rewel: dalam penulisan
 * Indonesia titik adalah pemisah RIBUAN, sementara JavaScript membacanya
 * sebagai koma desimal. "135.000" karena itu menjadi 135 — seperseribu dari
 * yang dimaksud, tanpa satu pun tanda bahwa ada yang salah.
 *
 * Singkatan ikut dimengerti karena memang begitu orang menulis di lapangan:
 * "135rb", "1,5jt". Yang mengetiknya sedang berdiri di proyek, bukan di depan
 * formulir akuntansi.
 */
export function angkaRupiah(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let t = teks(v).toLowerCase()
  if (!t) return 0
  t = t.replace(/rp/g, '').replace(/\s+/g, '')

  let kali = 1
  // Yang PALING PANJANG diperiksa lebih dulu. "juta" mengandung "jt" hanya
  // bila diperiksa terbalik — urutan yang salah membuat "juta" cocok sebagian
  // dan sisanya "a" ikut terbaca sebagai angka.
  for (const [pola, n] of [
    ['miliar', 1e9], ['milyar', 1e9], ['jt', 1e6], ['juta', 1e6],
    ['rb', 1e3], ['ribu', 1e3], ['k', 1e3],
  ] as Array<[string, number]>) {
    if (t.endsWith(pola)) { kali = n; t = t.slice(0, -pola.length); break }
  }

  // Titik = pemisah ribuan, koma = desimal. Dibalik dari bawaan JavaScript.
  t = t.replace(/\./g, '').replace(/,/g, '.')
  const n = Number(t.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n * kali : 0
}

/** Medan yang isinya angka. Sisanya teks, dan tidak boleh ikut dipaksa. */
const MEDAN_ANGKA = [
  'jumlah', 'volume', 'hargaSatuan', 'jumlahOrang', 'hariKerja', 'upahHarian',
] as const

/**
 * Bersihkan satu tambalan sebelum dipakai.
 *
 * Medan angka DIPAKSA menjadi angka lewat `angkaRupiah`, termasuk ketika AI
 * mengirimkannya sebagai teks. Membiarkannya lewat berarti menaruh string di
 * tempat number: penjumlahan berikutnya menyambung teks alih-alih menambah,
 * dan totalnya menjadi angka yang tidak bisa dilacak asalnya.
 *
 * Medan yang TIDAK dikenal dibuang. AI yang mengarang nama medan tidak boleh
 * bisa menyelundupkan apa pun ke dalam baris tersimpan.
 */
export function bersihkanPatch(
  data: Record<string, unknown> | null | undefined,
  medanSah: readonly string[],
): Record<string, unknown> {
  const hasil: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k === 'id' || !medanSah.includes(k)) continue
    if (v === null || v === undefined) continue
    if ((MEDAN_ANGKA as readonly string[]).includes(k)) {
      const n = angkaRupiah(v)
      // Nol dari teks yang tidak terbaca sama sekali ("entah berapa") bukan
      // perubahan, melainkan kegagalan membaca. Membiarkannya lewat akan
      // MENGOSONGKAN nominal yang tadinya benar.
      if (n === 0 && teks(v) !== '0' && v !== 0) continue
      hasil[k] = n
    } else {
      hasil[k] = v
    }
  }
  return hasil
}

export interface HasilSunting<T> {
  hasil: T[]
  /** Id yang benar-benar berubah isinya. */
  berubah: string[]
  /** Id yang disebut tetapi tidak ada di daftar. */
  hilang: string[]
  /** Id yang ada, tetapi tambalannya tidak menyisakan perubahan apa pun. */
  kosong: string[]
}

/**
 * Terapkan sekumpulan perubahan, dan laporkan apa yang SUNGGUH terjadi.
 *
 * Inilah bagian yang selama ini hilang. `map(e => e.id === id ? ... : e)` atas
 * id yang tidak ada tidak melempar apa pun dan tidak mengubah apa pun; yang
 * memanggilnya lalu menghitung berapa perubahan yang DIMINTA — bukan berapa
 * yang terjadi — dan mengabarkan keberhasilan yang tidak pernah ada.
 */
export function terapkanPerubahan<T extends { id: string }>(
  entries: T[] | null | undefined,
  perubahan: Array<{ id?: string; data?: Record<string, unknown> }> | null | undefined,
  medanSah: readonly string[],
): HasilSunting<T> {
  const daftar = [...(entries ?? [])]
  const berubah: string[] = []
  const hilang: string[] = []
  const kosong: string[] = []

  for (const p of perubahan ?? []) {
    const id = teks(p?.id)
    if (!id) { hilang.push('(tanpa id)'); continue }
    const i = daftar.findIndex(e => teks(e?.id) === id)
    if (i < 0) { hilang.push(id); continue }

    const patch = bersihkanPatch(p?.data, medanSah)
    const kunci = Object.keys(patch)
    if (!kunci.length) { kosong.push(id); continue }

    // Tambalan yang isinya sama persis dengan yang sudah ada bukan perubahan.
    // Melaporkannya sebagai perubahan membuat pemakainya mengira permintaannya
    // dikerjakan, padahal AI hanya mengulang nilai yang sudah di sana.
    const rec = daftar[i] as unknown as Record<string, unknown>
    if (kunci.every(k => rec[k] === patch[k])) { kosong.push(id); continue }

    daftar[i] = { ...daftar[i], ...patch }
    berubah.push(id)
  }
  return { hasil: daftar, berubah, hilang, kosong }
}

/**
 * Kalimat jujur tentang hasilnya.
 *
 * Menyebut yang GAGAL, bukan hanya yang berhasil. Notifikasi yang selalu
 * berbunyi berhasil membuat pemakainya menutup layar, dan baru menemukan
 * angkanya masih salah keesokan harinya — ketika ia sudah tidak ingat lagi apa
 * yang tadi ia minta.
 */
export function kalimatSunting(h: HasilSunting<unknown>): string {
  const gagal = h.hilang.length + h.kosong.length
  if (!h.berubah.length && !gagal) return ''
  if (!h.berubah.length) {
    return 'Tidak ada yang berubah. Baris yang dimaksud tidak ketemu —'
      + ' perbaiki langsung lewat tombol sunting di daftarnya.'
  }
  if (!gagal) return `${h.berubah.length} baris diperbarui.`
  return `${h.berubah.length} baris diperbarui, ${gagal} gagal.`
    + ' Yang gagal perbaiki langsung lewat tombol sunting di daftarnya.'
}

/**
 * Medan sebuah baris biaya yang boleh diubah.
 *
 * Daftar putih, bukan daftar hitam. `id` tidak ada di sini dengan sengaja:
 * baris yang id-nya tertimpa kehilangan jejak ke catatan penghapusan dan ke
 * surat jalan yang menautkannya — dan kehilangan itu tidak terlihat sampai
 * sinkronisasi berikutnya menghidupkan lagi baris yang sudah dihapus.
 */
export const MEDAN_BIAYA = [
  'tipe', 'tanggal', 'namaMaterial', 'volume', 'satuan', 'hargaSatuan',
  'namaSupplier', 'nomorNota', 'namaTukang', 'jenisKerja', 'jumlahOrang',
  'hariKerja', 'upahHarian', 'keterangan', 'kategori', 'jumlah', 'status',
  'metodePembayaran', 'linkedComponentId', 'doId',
] as const
