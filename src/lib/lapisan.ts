// ============================================================
// PropFS — Urutan lapisan, dan kenapa angkanya bukan selera
//
// Satu kenyataan menentukan seluruh berkas ini:
//
//   BottomNav berdiri di z-50, `fixed bottom-0`, dan dirender SETELAH
//   <Routes> di App.tsx.
//
// "Setelah" itu yang menentukan. Dua elemen dengan z-index sama diadu menurut
// urutan kemunculannya di dokumen, dan yang belakangan menang. Jadi setiap
// tirai halaman yang juga memakai z-50 KALAH — bukan seluruhnya, hanya 64
// piksel paling bawah. Persis tempat tombol aksi diletakkan.
//
// Akibatnya tidak pernah terlihat seperti cacat lapisan. Yang terlihat adalah
// tombol yang "terlalu di bawah", terpotong separuh, atau diketuk tetapi yang
// tertekan justru menu navigasi — dan halamannya berpindah ke tempat lain.
//
// Sebelum berkas ini, angkanya ditambal satu per satu: ada yang z-[60], ada
// z-[70], z-[80], bahkan z-[999]. Tidak satu pun salah; yang tidak ada adalah
// alasan kenapa berbeda. Tambalan berikutnya akan menebak lagi.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

/** Navigasi bawah. Titik acuannya — bukan untuk diubah. */
export const Z_NAV_BAWAH = 50

/**
 * Tirai layar penuh: pratinjau berkas, panel notifikasi, dialog.
 *
 * Harus DI ATAS navigasi bawah. Sebuah tirai yang menutupi seluruh layar
 * memang dimaksudkan menutupi navigasinya juga: selama ia terbuka, tidak ada
 * yang perlu berpindah halaman, dan tombol navigasi yang masih bisa ditekan
 * di baliknya hanya menjadi jebakan.
 */
export const Z_TIRAI = 60

/** Yang berdiri DI ATAS tirai — mis. konfirmasi di dalam dialog. */
export const Z_DI_ATAS_TIRAI = 70

/** Toast & pesan galat: harus terbaca di atas apa pun, termasuk dialog. */
export const Z_PESAN = 80

/**
 * Ruang yang harus disisakan di bawah sebuah tirai layar penuh.
 *
 * BUKAN untuk menghindari navigasi — tirai memang menutupinya. Ini untuk bilah
 * gestur di dasar layar HP modern: tombol yang menempel persis di tepi bawah
 * akan berbagi tempat dengan sapuan "kembali ke beranda", dan yang terjadi
 * bukan tombolnya tertekan melainkan aplikasinya tertutup.
 *
 * Dinyatakan sebagai kelas Tailwind supaya satu tempat ini yang menentukan,
 * bukan angka yang disalin ulang di tiap tirai lalu berselisih diam-diam.
 */
export const PADDING_BAWAH_TIRAI = 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'

/**
 * Apakah sebuah lapisan akan tertutup navigasi bawah.
 *
 * Sama-nilai pun DIANGGAP tertutup, dan itu inti pemeriksaannya: pada nilai
 * yang sama, yang menang adalah yang dirender belakangan — dan BottomNav
 * selalu dirender belakangan karena ia berada di bawah <Routes>.
 */
export function tertutupNav(z: unknown): boolean {
  const n = Number(z)
  if (!Number.isFinite(n)) return true
  return n <= Z_NAV_BAWAH
}
