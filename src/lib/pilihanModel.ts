// ============================================================
// PropFS — Memilih model dari katalog Google, bukan dari ingatan
//
// Nama model tidak boleh ditebak. Sudah dua kali tebakan itu merugikan:
// "Gemini 3 tidak ada" ternyata keliru, dan `gemini-3-flash` yang ditaruh di
// depan daftar membuat setiap pesan mengetuk nama yang belum tentu ada lalu
// menunggu penolakan sebelum mencoba yang benar-benar bisa dipakai.
//
// Yang berlaku hanya satu sumber: katalog yang dijawab Google untuk kunci yang
// sedang terpasang. Halaman Tes Koneksi sudah menanyakannya. Modul ini
// memeringkat isinya, memilih yang terbaik menurut aturan yang jelas, dan
// menyimpan pilihannya supaya jalur panas tidak perlu menebak lagi.
//
// Aturannya condong ke Flash dengan sengaja. Pro memang lebih pintar, tetapi
// tarif tokennya beberapa kali lipat, dan pemiliknya baru saja menanggung
// tagihan yang tidak ia lakukan. Naik ke Pro tetap bisa — dengan dipilih, bukan
// terjadi sendiri.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const KUNCI_SIMPAN = 'propfs-model-ai'

/** Model yang bukan untuk percakapan/pembacaan nota, apa pun versinya. */
const BUKAN_PERCAKAPAN = /-(tts|image|embedding|aqa|live|native-audio|audio)|image-generation|^embedding|^text-embedding|^aqa/i

/** Varian hemat yang kualitas bacanya di bawah Flash biasa. */
const HEMAT = /-lite/i

/**
 * Angka versi dari nama model: "gemini-3-flash" → 3, "gemini-2.5-pro" → 2.5.
 *
 * Nama alias seperti "gemini-flash-latest" tidak memuat angka; ia diberi versi
 * tertinggi yang mungkin, sebab menurut Google ia SELALU menunjuk yang terbaru.
 */
export function versiModel(nama: unknown): number {
  const n = String(nama ?? '')
  if (/-latest$/i.test(n)) return 99
  const m = /gemini-(\d+(?:\.\d+)?)/i.exec(n)
  return m ? Number(m[1]) : 0
}

export type Jalur = 'flash' | 'pro' | 'lain'

export function jalurModel(nama: unknown): Jalur {
  const n = String(nama ?? '').toLowerCase()
  if (n.includes('flash')) return 'flash'
  if (n.includes('pro')) return 'pro'
  return 'lain'
}

/** Layak dipakai untuk membaca nota & percakapan. */
export function layakPercakapan(nama: unknown): boolean {
  const n = String(nama ?? '').trim()
  if (!n || BUKAN_PERCAKAPAN.test(n)) return false
  return /^gemini-/i.test(n)
}

export interface Peringkat {
  nama: string
  versi: number
  jalur: Jalur
  hemat: boolean
}

export function peringkatModel(nama: string): Peringkat {
  return { nama, versi: versiModel(nama), jalur: jalurModel(nama), hemat: HEMAT.test(nama) }
}

/**
 * Flash terbaik yang BENAR-BENAR tersedia pada kunci ini.
 *
 * Alias "…-latest" sengaja tidak dimenangkan meski versinya dianggap tertinggi:
 * ia bisa berpindah ke model lain kapan saja tanpa ada yang memutuskan, dan
 * perpindahan diam-diam itulah yang sudah dua kali merepotkan di sini — sekali
 * pada biaya, sekali pada nama yang tidak ada. Ia hanya dipakai bila tidak ada
 * nama pasti yang tersedia.
 */
export function flashTerbaik(tersedia: readonly string[] | null | undefined): string | null {
  const kandidat = (tersedia ?? [])
    .map(t => String(t ?? '').replace(/^models\//, ''))
    .filter(layakPercakapan)
    .map(peringkatModel)
    .filter(p => p.jalur === 'flash' && !p.hemat)

  if (!kandidat.length) return null

  const pasti = kandidat.filter(p => p.versi < 99)
  const dipakai = pasti.length ? pasti : kandidat
  dipakai.sort((a, b) => b.versi - a.versi || a.nama.length - b.nama.length)
  return dipakai[0].nama
}

/**
 * Apakah `calon` benar-benar kenaikan dibanding `sekarang`.
 *
 * Versi yang sama bukan kenaikan meski namanya berbeda — berpindah tanpa
 * alasan hanya menukar satu yang sudah terbukti dengan satu yang belum.
 */
export function lebihBaru(calon: unknown, sekarang: unknown): boolean {
  const a = versiModel(calon)
  const b = versiModel(sekarang)
  return a > 0 && a > b
}

// ── Menyimpan pilihannya ────────────────────────────────────────────────────

type Gudang = { getItem(k: string): string | null; setItem(k: string, v: string): void
                removeItem(k: string): void }

const gudang = (): Gudang | null => {
  try { return (globalThis as { localStorage?: Gudang }).localStorage ?? null } catch { return null }
}

/**
 * Model yang dipilih admin, bila ada.
 *
 * Yang tersimpan hanya nama yang PERNAH TERBUKTI ada di katalog saat dipilih —
 * bukan tebakan. Itulah yang membuatnya aman ditaruh di depan jalur panas:
 * ia tidak menambah panggilan yang dijamin gagal.
 */
export function modelPilihan(): string | null {
  const g = gudang()
  if (!g) return null
  try {
    const n = (g.getItem(KUNCI_SIMPAN) ?? '').trim()
    return n && layakPercakapan(n) ? n : null
  } catch { return null }
}

export function simpanModelPilihan(nama: unknown): void {
  const g = gudang()
  if (!g) return
  try {
    const n = String(nama ?? '').trim()
    if (n && layakPercakapan(n)) g.setItem(KUNCI_SIMPAN, n)
    else g.removeItem(KUNCI_SIMPAN)
  } catch { /* penyimpanan penuh atau ditolak — pilihannya cuma tidak lengket */ }
}

/**
 * Urutan model untuk jalur panas: pilihan admin lebih dulu, lalu cadangan tetap.
 *
 * Cadangannya tidak pernah dibuang. Model bisa dihentikan Google kapan saja,
 * dan ketika itu terjadi yang menyelamatkan adalah nama lama yang masih hidup —
 * bukan pesan galat.
 */
export function urutanModel(bawaan: readonly string[], pilihan = modelPilihan()): string[] {
  return [...new Set([...(pilihan ? [pilihan] : []), ...bawaan])]
}
