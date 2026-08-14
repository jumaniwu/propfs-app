// ============================================================
// PropFS — Tautan publik bertoken, versi pendek
//
// Tautan yang dibagikan lewat WhatsApp dulu sepanjang ini:
//   https://www.propfs.id/vendor/daftar/270d656e72ff460caf685899f4f3f11d
// 68 karakter, dan di gelembung chat terpotong jadi tidak terbaca.
//
// Dua sumber panjangnya dipangkas sekaligus:
//   1. Jalur   — /vendor/daftar/ (15) menjadi /v/ (3)
//   2. Token   — UUID 32 heksadesimal menjadi 12 karakter alfabet aman
// Hasilnya https://propfs.id/v/K7M2P9QR4T6V — 32 karakter, kurang dari
// separuhnya.
//
// TAUTAN LAMA TETAP HIDUP. Jalur panjang tetap terdaftar sebagai rute, dan
// token lama tidak diubah di basis data — vendor serta pekerja yang sudah
// menyimpan tautannya di chat tidak perlu dikirimi ulang. Yang berubah hanya
// bentuk tautan yang dibuat mulai sekarang.
//
// Modul ini sengaja bebas DOM supaya bisa diuji langsung di Node.
// ============================================================

/**
 * Alfabet sama dengan buat_kode_perusahaan(): tanpa 0/O dan 1/I/L yang mudah
 * tertukar saat dibacakan atau diketik ulang dari layar HP.
 */
export const ALFABET_TOKEN = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/**
 * 12 karakter dari 31 huruf ≈ 59 bit. Sebagai pembanding, menebaknya butuh
 * ratusan juta tahun bahkan pada sejuta percobaan per detik — jauh melampaui
 * apa pun yang masuk akal untuk tautan yang cuma berlaku selama satu proyek.
 */
export const PANJANG_TOKEN = 12

export type JenisTautan =
  | 'vendor_daftar' | 'vendor_item' | 'po' | 'invoice' | 'kwitansi'
  | 'lapor' | 'progress' | 'spk_sign' | 'opname'
  | 'lead'

export interface PolaTautan {
  /** Jalur pendek yang dipakai untuk tautan baru. */
  pendek: string
  /** Jalur lama; tetap dilayani supaya tautan yang sudah tersebar tidak mati. */
  lama: string
}

/**
 * Awalan sengaja satu huruf. `po` dibiarkan apa adanya: sudah pendek, dan
 * memendekkannya lagi hanya menghemat satu karakter dengan menukar kejelasan.
 */
export const POLA_TAUTAN: Record<JenisTautan, PolaTautan> = {
  vendor_daftar: { pendek: '/v', lama: '/vendor/daftar' },
  vendor_item: { pendek: '/i', lama: '/vendor/item' },
  po: { pendek: '/po', lama: '/po' },
  // 'n' dari nota/tagihan. Huruf yang tersisa memang tinggal sedikit, dan
  // HURUF BESAR bukan jalan keluar: pencocokan rute React Router tidak peka
  // huruf besar, jadi '/N' akan bertabrakan dengan '/n'.
  invoice: { pendek: '/n', lama: '/vendor/invoice' },
  // 'r' dari receipt. Kwitansi dikirim ke konsumen — orang di luar perusahaan
  // yang mungkin mengetiknya ulang dari layar ponsel, jadi pendeknya berarti.
  kwitansi: { pendek: '/r', lama: '/kwitansi' },
  lapor: { pendek: '/l', lama: '/lapor' },
  progress: { pendek: '/p', lama: '/progress' },
  spk_sign: { pendek: '/s', lama: '/spk/sign' },
  opname: { pendek: '/o', lama: '/opname/isi' },
  // Form konsultasi calon konsumen. 'k' dari konsultasi — 'l' sudah dipakai
  // lapor harian, dan HURUF BESAR bukan jalan keluar: pencocokan rute React
  // Router tidak peka huruf besar, jadi '/L' akan bertabrakan dengan '/l'.
  // Jalur ini akan dicetak di kartu nama dan bio media sosial, jadi pendeknya
  // benar-benar berarti.
  lead: { pendek: '/k', lama: '/leads' },
}

/** Jalur pendek dan lama sebuah jenis; `po` hanya menghasilkan satu. */
export function jalurTautan(jenis: JenisTautan): string[] {
  const { pendek, lama } = POLA_TAUTAN[jenis]
  return pendek === lama ? [pendek] : [pendek, lama]
}

/**
 * Asal situs yang dipakai membangun tautan.
 *
 * `www.` dibuang: apex dan www melayani aplikasi yang sama, jadi empat
 * karakter itu murni beban. Selain itu asal dipakai apa adanya supaya
 * localhost dan pratinjau Vercel tetap menghasilkan tautan yang bisa dibuka.
 */
export function basisSitus(origin: string): string {
  return origin.replace(/^(https?:\/\/)www\./i, '$1').replace(/\/+$/, '')
}

/** Tautan publik lengkap untuk sebuah token. Selalu memakai jalur pendek. */
export function tautanPublik(jenis: JenisTautan, token: string, origin: string): string {
  return `${basisSitus(origin)}${POLA_TAUTAN[jenis].pendek}/${token}`
}

/**
 * Token dianggap sah bila hanya berisi huruf alfabet aman (bentuk baru) atau
 * heksadesimal (bentuk lama). Dipakai untuk menolak lebih awal tautan yang
 * jelas salah ketik, bukan sebagai pengganti pemeriksaan di server.
 */
export function tokenValid(token: string | null | undefined): boolean {
  if (typeof token !== 'string') return false
  const t = token.trim()
  if (t.length < 8 || t.length > 64) return false
  return /^[0-9a-f]+$/i.test(t) || new RegExp(`^[${ALFABET_TOKEN}]+$`).test(t.toUpperCase())
}

/**
 * Apakah token sudah bentuk pendek.
 *
 * Token yang sudah terlanjur dibuat tidak diganti otomatis — mengganti diam-
 * diam akan mematikan tautan yang sudah tersebar. Pemilik yang ingin tautan
 * pendek harus menerbitkannya ulang, dan ini yang menentukan kapan tawaran itu
 * ditampilkan.
 */
export function tokenSudahPendek(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.trim().length <= PANJANG_TOKEN
}

/**
 * Token pendek acak. Dipakai di sisi klien hanya untuk pratinjau dan test —
 * token sungguhan selalu dibuat server lewat buat_token_pendek(), supaya
 * keunikannya dijamin batasan kolom, bukan harapan.
 */
export function tokenPendek(
  panjang = PANJANG_TOKEN,
  acak: () => number = Math.random,
): string {
  let out = ''
  for (let i = 0; i < panjang; i++) {
    out += ALFABET_TOKEN[Math.floor(acak() * ALFABET_TOKEN.length) % ALFABET_TOKEN.length]
  }
  return out
}
