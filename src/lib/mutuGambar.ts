// ============================================================
// PropFS — Mutu render, dan harganya SEBELUM tombolnya ditekan
//
// Sebabnya sebuah tagihan, bukan preferensi.
//
// Pada 16 Agustus 2026 model gambar termahal disisipkan ke depan satu-satunya
// daftar model gambar yang ada. Sejak itu tiap render memakainya. Tidak ada
// yang memutuskannya, tidak ada yang melihatnya, dan halaman AI Billing
// aplikasi ini mencatatnya Rp 0 karena namanya belum ada di tabel tarif.
// Yang pertama kali memberitahu adalah tagihan Google: Rp 530 ribu dalam
// satu hari.
//
// Dua hal yang membuat itu mungkin, dan keduanya ditutup di sini:
//
//   1. Mutu tinggi tidak lagi menjadi bawaan diam-diam. Ia pilihan, dan
//      pilihannya menyebutkan harganya.
//   2. Satu ketukan yang menghasilkan BEBERAPA gambar berbayar harus
//      mengatakannya lebih dulu. "Render 3 sudut" terasa seperti satu
//      perintah; ia tiga kali bayar.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import { MODEL_GAMBAR_HEMAT, MODEL_GAMBAR_TINGGI } from './modelAi.ts'
import { hitungBiaya, tarifModel, type Biaya } from './biayaAi.ts'

export type MutuGambar = 'hemat' | 'tinggi'

export const MUTU_BAWAAN: MutuGambar = 'hemat'

/** Urutan model untuk sebuah pilihan mutu. */
export function modelUntukMutu(mutu: MutuGambar): readonly string[] {
  return mutu === 'tinggi' ? MODEL_GAMBAR_TINGGI : MODEL_GAMBAR_HEMAT
}

/**
 * Model yang akan BENAR-BENAR dicoba lebih dulu.
 *
 * Dipakai untuk memperkirakan harga, dan itu sebabnya ia diturunkan dari
 * daftarnya alih-alih ditulis ulang sebagai konstanta. Versi lama menuliskan
 * `const MODEL_GAMBAR_UTAMA = 'gemini-2.5-flash-image'` di ai-render.ts; ketika
 * model Pro disisipkan ke depan daftar, konstanta itu tidak ikut berubah, dan
 * seluruh pencatatan biaya menyebut model yang salah — yang murah, padahal
 * yang dipakai yang mahal.
 */
export function modelPertama(mutu: MutuGambar): string {
  return modelUntukMutu(mutu)[0]
}

export interface RincianMutu {
  mutu: MutuGambar
  label: string
  /** Satu kalimat: untuk apa pilihan ini pantas dipakai. */
  untuk: string
  model: string
  biaya: Biaya
}

const LABEL: Record<MutuGambar, { label: string; untuk: string }> = {
  hemat: {
    label: 'Standar',
    untuk: 'Cukup untuk melihat bentuk kawasan dan berdiskusi dengan tim.',
  },
  tinggi: {
    label: 'Mutu Tinggi',
    untuk: 'Untuk materi presentasi ke pemilik proyek atau calon pembeli.',
  },
}

/**
 * Perkiraan biaya satu ketukan render.
 *
 * `tokenMasukan` sengaja tidak nol dan tidak kecil: masukannya bukan hanya
 * kalimat perintah, melainkan gambar skematik PNG — dan pada render dari CAD,
 * ditambah foto denah aslinya. Gambar masukan ikut ditagih. Menghitungnya dari
 * panjang teks saja, seperti yang dilakukan pencatatan sebelumnya, membuat
 * sisi masukan hampir hilang dari perkiraan.
 */
export function perkiraanRender(mutu: MutuGambar, jumlahGambar: number): Biaya {
  const n = Math.max(0, Math.floor(Number(jumlahGambar) || 0))
  const model = modelPertama(mutu)
  return hitungBiaya({
    model,
    gambar: n,
    // ±1.500 token perintah + ±1.100 token per gambar masukan.
    tokenMasukan: n * 2600,
    tokenKeluaran: n * 50,
  })
}

/** Kedua pilihan berikut harganya, untuk ditampilkan berdampingan. */
export function pilihanMutu(jumlahGambar: number): RincianMutu[] {
  return (['hemat', 'tinggi'] as MutuGambar[]).map(mutu => ({
    mutu,
    ...LABEL[mutu],
    model: modelPertama(mutu),
    biaya: perkiraanRender(mutu, jumlahGambar),
  }))
}

/** Rp 1.234.567 → "Rp 1.234.567". Tanpa Intl supaya sama di Node dan peramban. */
export function rupiah(n: unknown): string {
  const v = Math.round(Number(n) || 0)
  const tanda = v < 0 ? '-' : ''
  return `${tanda}Rp ${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

/**
 * Kalimat yang ditampilkan TEPAT SEBELUM tombolnya ditekan.
 *
 * Menyebut jumlahnya lebih dulu, bukan harganya: yang paling sering
 * mengejutkan orang bukan tarif per gambar, melainkan bahwa satu ketukan
 * ternyata tiga kali bayar.
 */
export function kalimatKonfirmasi(mutu: MutuGambar, jumlahGambar: number): string {
  const n = Math.max(0, Math.floor(Number(jumlahGambar) || 0))
  if (n === 0) return 'Pilih dulu minimal satu sudut pandang.'
  const b = perkiraanRender(mutu, n)
  const mutuLabel = LABEL[mutu].label
  return `Render ${n} sudut = ${n} gambar berbayar (${mutuLabel}). `
    + `Perkiraan ${rupiah(b.idr)}. Angka ini tarif daftar, bukan tagihan resmi.`
}

/**
 * Apakah pilihan ini pantas diberi peringatan menonjol.
 *
 * Bukan sekadar "mahal": yang ditandai adalah selisih yang membuat orang
 * menyesal setelah melihat tagihannya. Ambangnya dinyatakan sebagai KELIPATAN
 * terhadap pilihan hemat, bukan sebagai angka rupiah tetap — angka tetap akan
 * basi begitu tarifnya atau kursnya berubah.
 */
export function jauhLebihMahal(jumlahGambar: number, kelipatan = 2): boolean {
  const hemat = perkiraanRender('hemat', jumlahGambar).usd
  const tinggi = perkiraanRender('tinggi', jumlahGambar).usd
  if (hemat <= 0) return tinggi > 0
  return tinggi / hemat >= kelipatan
}

/** Apakah model ini menghasilkan gambar — dipakai memberi peringatan biaya. */
export function modelnyaMahal(model: unknown): boolean {
  return tarifModel(model).gambar
}
