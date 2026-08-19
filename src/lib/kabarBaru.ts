// ============================================================
// PropFS — Kapan lonceng notifikasi boleh menanyakan kabar lagi
//
// Lonceng ini punya satu cacat yang membuatnya nyaris tidak berguna: isinya
// baru dimuat KETIKA loncengnya dibuka. Sebelum itu daftarnya kosong, dan
// lencana dihitung dari daftar kosong — jadi angkanya selalu nol.
//
// Artinya: satu-satunya cara mengetahui ada kabar baru adalah membuka lonceng
// untuk memeriksa. Yang tersisa dari sebuah notifikasi kalau begitu hanyalah
// namanya.
//
// Tetapi memuatnya di setiap layar juga bukan jawabannya, dan alasannya sudah
// ditulis di berkas loncengnya sendiri: tujuh permintaan jaringan sekaligus
// setiap kali sebuah halaman dibuka, ditanggung pemakai yang sedang berdiri
// di lapangan dengan sinyal seadanya. KontraktorHeader dipasang di belasan
// halaman; berpindah halaman akan berarti tujuh permintaan lagi.
//
// Jadi yang dipisahkan di sini adalah PERTANYAANNYA, bukan jawabannya:
// "sudah pantaskah bertanya lagi sekarang?" Hasilnya dipakai bersama oleh
// seluruh halaman, dan jedanya cukup panjang untuk tidak membebani jaringan
// tetapi cukup pendek untuk kabar yang datangnya per jam, bukan per detik.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/** Jeda bawaan antar pemuatan diam-diam. */
export const JEDA_MUAT_MS = 120_000

export interface KeadaanMuat {
  /** Kapan terakhir berhasil dimuat. 0 = belum pernah. */
  terakhirMuat: number
  /** Sedang berjalan — jangan menumpuk permintaan kedua di atasnya. */
  sedangMuat: boolean
  sekarang: number
  /** Paksa, mis. tombol muat ulang atau lonceng baru dibuka. */
  paksa?: boolean
  jedaMs?: number
}

/**
 * Apakah kabar pantas ditanyakan sekarang.
 *
 * `sedangMuat` diperiksa LEBIH DULU daripada `paksa`, dan urutan itu penting:
 * menekan tombol muat ulang tiga kali berturut-turut tidak boleh melahirkan
 * tiga permintaan yang saling menyalip, karena yang terakhir selesai belum
 * tentu yang terakhir dikirim — dan daftar bisa berakhir dengan isi yang lebih
 * lama daripada yang sudah tampil.
 */
export function perluMuat(k: KeadaanMuat): boolean {
  if (k.sedangMuat) return false
  if (k.paksa) return true
  if (!k.terakhirMuat) return true
  const jeda = Number(k.jedaMs) > 0 ? Number(k.jedaMs) : JEDA_MUAT_MS
  return k.sekarang - k.terakhirMuat >= jeda
}

/**
 * Tanda waktu "sudah dibaca sampai sini" setelah lonceng dibuka.
 *
 * Diambil dari kabar TERBARU yang sedang tampil, bukan dari jam sekarang.
 *
 * Bedanya baru terasa ketika ada kabar yang datang selagi loncengnya terbuka:
 * memakai jam sekarang akan menandai terbaca sesuatu yang belum pernah muncul
 * di layar. Kabar itu hilang tanpa pernah dilihat siapa pun — dan justru kabar
 * yang datang saat orangnya sedang memperhatikan adalah kabar yang paling
 * mungkin penting.
 */
export function batasDibaca(daftar: Array<{ waktu: string }>, cadangan = ''): string {
  const teratas = daftar?.[0]?.waktu
  return typeof teratas === 'string' && teratas ? teratas : cadangan
}

/**
 * Ringkasan lencana untuk dibaca dengan pembaca layar.
 *
 * Angka telanjang di dalam lingkaran tidak berbunyi apa-apa bagi yang tidak
 * bisa melihatnya, dan lonceng adalah tombol yang justru paling perlu
 * menjelaskan dirinya: isinya berubah tanpa halamannya berpindah.
 */
export function labelLonceng(jumlah: number): string {
  const n = Math.max(0, Math.floor(Number(jumlah) || 0))
  if (n === 0) return 'Notifikasi — tidak ada kabar baru'
  if (n === 1) return 'Notifikasi — 1 kabar baru'
  return `Notifikasi — ${n} kabar baru`
}
