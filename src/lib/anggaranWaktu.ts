// ============================================================
// PropFS — Anggaran waktu untuk satu pekerjaan, bukan untuk satu panggilan
//
// Sebabnya kegagalan yang saya buat sendiri, dan bentuknya khas.
//
// Chat AI menggantung tanpa akhir, jadi batas waktu 75 detik dipasang pada tiap
// panggilan. Tetapi pemanggilnya punya perulangan: dua model, masing-masing dua
// percobaan. Ketika batas itu memutus panggilan, galatnya berbunyi "The
// operation was aborted" — yang dibaca pengklasifikasi sebagai gangguan
// jaringan, dan gangguan jaringan LAYAK DIULANG.
//
// Jadi batas waktunya tidak menghentikan apa pun. Ia memberi makan
// perulangannya: 75 detik, ulangi, 75 detik lagi, ulangi. Di layar pemakainya
// terhitung 102 detik dan masih berputar — persis di tengah percobaan kedua.
// Pengaman yang dipasang untuk menghentikan penungguan justru melipatgandakannya
// menjadi empat kali lipat.
//
// Batas waktu per panggilan tidak pernah cukup untuk pekerjaan yang punya
// perulangan. Yang dibutuhkan adalah anggaran untuk SELURUH pekerjaan: tiap
// percobaan mengambil dari kantong yang sama, dan begitu kantongnya habis tidak
// ada lagi percobaan berikutnya — berapa pun sisa jatah percobaan di atas kertas.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/** Penanda galat yang lahir dari anggaran kita sendiri, bukan dari jaringan. */
export const WAKTU_HABIS = 'WAKTU_HABIS'

export interface Anggaran {
  /** Milidetik yang tersisa; tidak pernah negatif. */
  sisa(): number
  /** Anggarannya sudah habis. */
  habis(): boolean
  /**
   * Jatah untuk satu percobaan: yang lebih kecil antara jatah wajar dan sisa.
   *
   * Menjatahkan lebih dari sisa berarti percobaan itu boleh melewati tenggat
   * seluruh pekerjaan — dan itulah yang membuat penungguan berlipat.
   */
  jatah(wajar: number): number
}

/**
 * Anggaran yang mulai berjalan saat dibuat.
 *
 * `sekarang` bisa diganti supaya perilakunya bisa diuji tanpa menunggu waktu
 * sungguhan berlalu — pengujian yang harus menunggu 75 detik tidak akan pernah
 * dijalankan orang, dan pengaman yang tidak diuji adalah pengaman yang belum
 * terbukti.
 */
export function buatAnggaran(totalMs: number, sekarang: () => number = Date.now): Anggaran {
  const mulai = sekarang()
  const total = Math.max(0, Number(totalMs) || 0)
  const sisa = () => Math.max(0, total - (sekarang() - mulai))
  return {
    sisa,
    habis: () => sisa() <= 0,
    jatah: (wajar: number) => Math.min(Math.max(0, Number(wajar) || 0), sisa()),
  }
}

/**
 * Apakah masih pantas mencoba lagi.
 *
 * Sisa waktu yang terlalu tipis lebih buruk daripada tidak mencoba sama sekali:
 * ia menghabiskan sisa kesabaran pemakainya untuk percobaan yang sudah pasti
 * terputus di tengah jalan, lalu tetap berakhir dengan pesan gagal.
 */
export function pantasDicobaLagi(a: Anggaran, minimalMs = 8000): boolean {
  return a.sisa() >= minimalMs
}

/** Galat yang menandai anggaran habis — bukan gangguan jaringan. */
export function galatWaktuHabis(detik: number): Error {
  const e = new Error(
    `${WAKTU_HABIS}: AI tidak selesai dalam ${detik} detik. `
    + 'Coba kirim ulang dengan foto yang lebih sedikit, atau ketik isi notanya.',
  )
  e.name = 'GalatWaktuHabis'
  return e
}
