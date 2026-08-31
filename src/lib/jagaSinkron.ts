// ============================================================
// PropFS — Jangan pernah menulis ke cloud sebelum membacanya
//
// Data akuntan disimpan sebagai SATU baris berisi seluruh isinya, dan tiap
// perubahan menulis ulang baris itu dengan `upsert`. Bentuk itu sendiri wajar.
// Yang tidak wajar: penulisannya tidak pernah menunggu pembacaan.
//
// Akibatnya persis kehilangan data, dan jalannya begini:
//
//   1. Aplikasi dibuka di tempat yang penyimpanan lokalnya kosong — peramban
//      baru, APK yang baru dipasang ulang, cache yang dibersihkan, atau
//      sekadar `persist` yang belum sempat memulihkan isinya.
//   2. Pembacaan cloud belum selesai — atau gagal, dan kegagalannya hanya
//      dicatat ke console, tidak terlihat siapa pun.
//   3. Pemakai menambah SATU pemasukan.
//   4. Penulisan berangkat membawa seluruh keadaan lokal — yang berisi satu
//      baris itu saja — dan MENIMPA salinan cloud berisi pekerjaan kemarin.
//
// Sejak itu tidak ada lagi yang bisa dipulihkan: yang di cloud sudah tertimpa,
// yang di perangkat memang tidak pernah ada.
//
// Penjaga di bawah membuat langkah 4 mustahil. Penulisan ditahan sampai
// pembacaan berhasil sekali; perubahan yang terjadi selama penantian tidak
// dibuang melainkan ditandai, lalu dikirim SETELAH digabungkan dengan isi
// cloud.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export interface PenjagaSinkron {
  /** Boleh menulis ke cloud sekarang? */
  bolehTulis(): boolean
  /** Tandai pembacaan cloud BERHASIL. Sejak ini penulisan diizinkan. */
  tandaiTerbaca(): void
  /** Ada perubahan yang tertahan karena cloud belum terbaca. */
  adaTertahan(): boolean
  /** Tandai bahwa sebuah perubahan tertahan. */
  tahan(): void
  /** Ambil & bersihkan penanda tertahan — dipakai setelah pembacaan selesai. */
  lepasTertahan(): boolean
  /** Untuk pengujian & keluar-masuk akun. */
  setelUlang(): void
}

export function buatPenjagaSinkron(): PenjagaSinkron {
  let terbaca = false
  let tertahan = false
  return {
    bolehTulis: () => terbaca,
    tandaiTerbaca() { terbaca = true },
    adaTertahan: () => tertahan,
    tahan() { tertahan = true },
    lepasTertahan() { const t = tertahan; tertahan = false; return t },
    setelUlang() { terbaca = false; tertahan = false },
  }
}

/**
 * Apakah penulisan ini berbahaya: mengosongkan yang sebelumnya berisi.
 *
 * Lapis kedua, di belakang penjaga di atas. Penjaga menutup jalur yang sudah
 * diketahui; pemeriksaan ini menangkap jalur yang belum terpikirkan — sebuah
 * keadaan lokal kosong yang hendak menimpa cloud yang berisi.
 *
 * Kosong menimpa kosong tidak apa-apa. Berisi menimpa apa pun juga tidak apa-
 * apa: itu memang pekerjaan orangnya. Yang dilarang hanya satu arah, dan
 * hanya arah itulah yang menghapus.
 */
export function tulisanBerbahaya(
  jumlahLokal: unknown, jumlahCloud: unknown,
): boolean {
  const l = Math.max(0, Math.floor(Number(jumlahLokal) || 0))
  const c = Math.max(0, Math.floor(Number(jumlahCloud) || 0))
  return l === 0 && c > 0
}

export const PESAN_TERTAHAN = 'Perubahan ditahan sampai data lama selesai dibaca,'
  + ' supaya tidak menimpa catatan sebelumnya.'

export const PESAN_BACA_GAGAL = 'Data akuntan belum bisa dibaca dari cloud.'
  + ' Perubahan disimpan di perangkat ini dulu — jangan tutup aplikasinya'
  + ' sebelum tersambung lagi.'
