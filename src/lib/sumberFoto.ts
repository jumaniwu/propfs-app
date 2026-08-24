// ============================================================
// PropFS — Foto boleh datang dari kamera ATAU dari album
//
// Sebuah `<input type="file" accept="image/*">` yang diberi atribut `capture`
// tidak sekadar "membuka kamera lebih dulu". Pada Android ia MENGHILANGKAN
// pilihan galeri sama sekali: yang muncul langsung aplikasi kamera, dan tidak
// ada jalan dari situ menuju foto yang sudah ada.
//
// Akibatnya di lapangan bukan soal selera. Pengawas memotret pekerjaan sambil
// berjalan, lalu mengisi laporan sore hari di kantor — foto-fotonya sudah ada
// di album, dan satu-satunya cara memasukkannya adalah memotret ulang layar
// HP-nya sendiri. Tombolnya bahkan bertuliskan "Ambil / Pilih Foto", menjanji-
// kan sesuatu yang atributnya sendiri melarang.
//
// Karena itu keduanya disediakan TERANG-TERANGAN sebagai dua tombol, bukan
// dengan sekadar membuang `capture`. Membuangnya memang memunculkan pemilih
// bawaan sistem, tetapi pada sebagian Android pemilih itu menambah satu-dua
// ketukan sebelum sampai ke kamera — memperbaiki satu keluhan sambil membuat
// pekerjaan yang paling sering dilakukan jadi lebih lambat.
//
// CATATAN YANG PENTING TENTANG `capture`: ia PETUNJUK, bukan jaminan. Sebagian
// peramban mengabaikannya, dan bahkan ketika dipatuhi, memotret layar berisi
// foto lama tetap menghasilkan "foto kamera". Jadi ia tidak pernah bisa
// dipakai sebagai bukti bahwa sebuah foto diambil saat itu juga; yang bisa
// hanya penanda waktu dan lokasi di sisi server.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

export type SumberFoto = 'kamera' | 'galeri'

/** Kamera mana yang dibuka: belakang untuk objek, depan untuk orang. */
export type ArahKamera = 'belakang' | 'depan'

export interface AtributInput {
  /** Tidak ada bila sumbernya galeri — dan justru itu intinya. */
  capture?: 'environment' | 'user'
  accept: string
  multiple: boolean
}

/**
 * Atribut untuk sebuah `<input type="file">`.
 *
 * `capture` sengaja TIDAK PERNAH disetel untuk galeri: nilai apa pun di sana —
 * termasuk string kosong — sudah cukup membuat sebagian peramban membuka
 * kamera, dan kesalahan itu tidak terlihat sampai ada yang mencoba memilih
 * foto lama.
 */
export function atributInput(
  sumber: SumberFoto,
  opsi: { arah?: ArahKamera; banyak?: boolean } = {},
): AtributInput {
  const dasar = { accept: 'image/*', multiple: !!opsi.banyak }
  if (sumber === 'galeri') return dasar
  return { ...dasar, capture: opsi.arah === 'depan' ? 'user' : 'environment' }
}

/** Nama tombolnya. Pendek — keduanya berdampingan di layar 390 piksel. */
export function labelSumber(sumber: SumberFoto): string {
  return sumber === 'kamera' ? 'Kamera' : 'Galeri'
}

/**
 * Keterangan satu baris di bawah kedua tombol.
 *
 * Menyebut BATASNYA, bukan cuma mengajak. Pengawas yang sudah memotret dua
 * puluh foto lalu menemukan hanya lima yang masuk akan menyangka aplikasinya
 * memakan sisanya.
 */
export function petunjukFoto(maks: number, terpakai: number): string {
  const sisa = Math.max(0, Math.floor(Number(maks) || 0) - Math.max(0, Math.floor(Number(terpakai) || 0)))
  if (sisa === 0) return `Sudah ${maks} foto — hapus salah satu dulu untuk menambah.`
  return `Bisa dari kamera atau album. Sisa ${sisa} foto lagi.`
}

/**
 * Berapa berkas yang masih boleh diterima dari sebuah pilihan.
 *
 * Dipakai memotong pilihan yang melebihi batas SEBELUM berkasnya dikecilkan.
 * Mengecilkan dua puluh foto lalu membuang lima belas di antaranya adalah
 * belasan detik yang dihabiskan pemakai untuk menunggu pekerjaan yang memang
 * akan dibuang.
 */
export function sisaMuat(maks: unknown, terpakai: unknown): number {
  const m = Math.max(0, Math.floor(Number(maks) || 0))
  const t = Math.max(0, Math.floor(Number(terpakai) || 0))
  return Math.max(0, m - t)
}
