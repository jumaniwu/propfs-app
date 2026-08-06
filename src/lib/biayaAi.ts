// ============================================================
// PropFS — Menghitung biaya panggilan AI, termasuk yang menghasilkan GAMBAR
//
// Halaman AI Billing di aplikasi selama ini buta terhadap panggilan yang
// paling mahal, karena dua hal sekaligus:
//
//   1. `trackUsage()` hanya dipanggil di Chat AI (ai-realisasi.ts). Tiga
//      tempat yang memanggil model GAMBAR — AI Architect (render masterplan),
//      render dari CAD/PDF, dan "Rapikan foto" di Marcom — tidak mencatat
//      apa pun.
//   2. Biayanya dihitung per 1.000 token saja. Model gambar tidak ditagih per
//      token keluaran; ia ditagih PER GAMBAR, dan satu gambar setara ribuan
//      token. Jadi seandainya pun tercatat, angkanya akan jauh di bawah
//      kenyataan.
//
// Akibatnya tagihan di Google tidak bisa dicocokkan dengan angka di aplikasi,
// dan ketika tagihannya melonjak tidak ada cara mengetahui fitur mana yang
// menyebabkannya. Modul ini memperbaiki dasar hitungnya; pencatatannya
// dipasang di tiap tempat pemanggilan.
//
// Angka-angka di bawah adalah TARIF DAFTAR yang bisa berubah sewaktu-waktu
// oleh penyedianya. Ia dipakai untuk memperkirakan dan membandingkan antar
// fitur — bukan untuk menandingi tagihan resmi. Itu sebabnya `perkiraan`
// selalu ikut dikembalikan.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/** Tarif satu model. Token dalam USD per 1 JUTA token; gambar per keluaran. */
export interface TarifModel {
  /** USD per 1 juta token masukan. */
  masukan: number
  /** USD per 1 juta token keluaran. */
  keluaran: number
  /** USD per satu gambar yang dihasilkan. 0 = model ini tidak membuat gambar. */
  perGambar: number
  /** Model ini menghasilkan gambar — dipakai untuk memberi peringatan biaya. */
  gambar: boolean
}

/**
 * Tarif daftar per model, dalam USD.
 *
 * Yang penting dari tabel ini bukan ketepatan sen-nya, melainkan PERBANDINGAN
 * ordonya: satu gambar berharga puluhan kali satu percakapan teks biasa.
 * Itulah yang menjelaskan tagihan yang melonjak dalam sehari.
 */
export const TARIF: Record<string, TarifModel> = {
  'gemini-2.5-flash':      { masukan: 0.30, keluaran: 2.50, perGambar: 0, gambar: false },
  'gemini-2.0-flash':      { masukan: 0.10, keluaran: 0.40, perGambar: 0, gambar: false },
  'gemini-2.5-flash-image': { masukan: 0.30, keluaran: 2.50, perGambar: 0.039, gambar: true },
  'gemini-2.0-flash-preview-image-generation':
    { masukan: 0.10, keluaran: 0.40, perGambar: 0.039, gambar: true },
  'meta-llama/llama-4-scout:free': { masukan: 0, keluaran: 0, perGambar: 0, gambar: false },
  'llama-3.1-8b-instant':  { masukan: 0.05, keluaran: 0.08, perGambar: 0, gambar: false },
}

/** Dipakai bila modelnya belum ada di tabel — jangan menganggapnya gratis. */
export const TARIF_BAWAAN: TarifModel = { masukan: 0.30, keluaran: 2.50, perGambar: 0, gambar: false }

export const USD_KE_IDR = 16300

export function tarifModel(model: unknown): TarifModel {
  const m = String(model ?? '').trim()
  return TARIF[m] ?? TARIF_BAWAAN
}

/** Apakah model ini menghasilkan gambar — yaitu, mahal. */
export function modelGambar(model: unknown): boolean {
  return tarifModel(model).gambar
}

export interface PemakaianAi {
  model: string
  tokenMasukan?: number
  tokenKeluaran?: number
  /** Berapa gambar yang dihasilkan panggilan ini. */
  gambar?: number
}

export interface Biaya {
  usd: number
  idr: number
  /** Bagian biaya yang datang dari gambar — inilah yang biasanya mendominasi. */
  idrGambar: number
  /** Selalu true: ini tarif daftar, bukan tagihan resmi. */
  perkiraan: true
}

const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Biaya satu panggilan.
 *
 * Gambar dihitung TERPISAH dari token, bukan disamakan. Menyamakannya adalah
 * cacat yang membuat perkiraan aplikasi meleset puluhan kali lipat justru pada
 * panggilan yang paling perlu diawasi.
 */
export function hitungBiaya(p: PemakaianAi): Biaya {
  const t = tarifModel(p?.model)
  const masuk = angka(p?.tokenMasukan)
  const keluar = angka(p?.tokenKeluaran)
  const gbr = Math.floor(angka(p?.gambar))

  const usdToken = (masuk * t.masukan + keluar * t.keluaran) / 1_000_000
  const usdGambar = gbr * t.perGambar
  const usd = usdToken + usdGambar

  return {
    usd,
    idr: Math.round(usd * USD_KE_IDR),
    idrGambar: Math.round(usdGambar * USD_KE_IDR),
    perkiraan: true,
  }
}

/** Perkiraan kasar jumlah token dari panjang teks. */
export function perkiraToken(teks: unknown): number {
  const t = String(teks ?? '')
  if (!t) return 0
  // ~4 karakter per token untuk teks Latin; cukup untuk membandingkan fitur.
  return Math.ceil(t.length / 4)
}

/**
 * Perkiraan biaya SEBELUM tombolnya ditekan.
 *
 * Dipakai untuk memberi tahu di muka bahwa satu ketukan menghasilkan beberapa
 * gambar berbayar — misalnya render tiga sudut sekaligus. Orang berhak tahu
 * harga sebelum membeli, bukan sesudah tagihannya datang.
 */
export function perkiraBiayaGambar(model: string, jumlahGambar: number): Biaya {
  return hitungBiaya({ model, gambar: jumlahGambar, tokenMasukan: 1500, tokenKeluaran: 50 })
}

/** "Rp 1.900" — untuk ditampilkan apa adanya. */
export function rupiah(idr: unknown): string {
  const n = Math.round(Number(idr) || 0)
  return `Rp ${n.toLocaleString('id-ID')}`
}
