// ============================================================
// PropFS — Apa yang dilihat orang saat membuka alamat pokok
//
// Satu alamat, dua pemakai yang sangat berbeda:
//
//   DI PERAMBAN, propfs.id adalah halaman jualan. Orang sampai ke sana dari
//   Google atau dari kartu nama, belum tahu ini apa, dan harus dibujuk lebih
//   dulu. Halaman itu tidak boleh hilang — ia satu-satunya cara pemakai baru
//   datang.
//
//   DI DALAM APK, orang sudah memasang aplikasinya. Ia tidak perlu dibujuk;
//   ia mau bekerja. Menyuguhkan halaman jualan lengkap dengan tombol "Coba
//   Gratis" setiap kali ikon diketuk adalah satu ketukan tambahan pada
//   pekerjaan yang paling sering dilakukan — dan membuat aplikasinya terasa
//   seperti peramban yang menyamar, bukan aplikasi.
//
// Karena itu keputusannya dipisah ke sini, sebagai fungsi murni: yang
// menentukan bukan "sedang di mana halamannya" melainkan "siapa yang membuka
// dan dengan apa".
//
// Tanpa DOM, tanpa store, bisa diuji langsung di Node.
// ============================================================

export type TujuanAwal =
  /** Tampilkan halaman jualan apa adanya. */
  | { jenis: 'landing' }
  /** Sesi masih dipulihkan — jangan putuskan apa pun dulu. */
  | { jenis: 'tunggu' }
  /** Langsung pindah ke alamat ini. */
  | { jenis: 'pindah'; ke: string }

export interface KeadaanAwal {
  /** Berjalan sebagai APK Android. */
  diApk: boolean
  /** Sesi masih dibaca dari penyimpanan. */
  memuat: boolean
  sudahLogin: boolean
  /** Beranda pemakai ini bila sudah login. */
  beranda: string
}

export const RUTA_MASUK = '/auth'

/**
 * Ke mana orang dibawa saat membuka alamat pokok.
 *
 * DI PERAMBAN JAWABANNYA SELALU SAMA: halaman jualan, tanpa menunggu sesi.
 * Ini disengaja dan tidak boleh "diperbaiki" menjadi lebih pintar — halaman
 * itu harus tampil seketika, termasuk bagi mesin pengindeks Google yang tidak
 * pernah punya sesi dan tidak menunggu apa pun.
 *
 * DI DALAM APK jawabannya menunggu sesi selesai dibaca. Menebak lebih dulu
 * berarti melempar pemakai yang sebenarnya sudah login ke halaman masuk,
 * lalu menariknya kembali sepersekian detik kemudian — kedipan yang membuat
 * orang mengira ia baru saja ter-logout.
 */
export function tujuanAwal(k: KeadaanAwal): TujuanAwal {
  if (!k.diApk) return { jenis: 'landing' }
  if (k.memuat) return { jenis: 'tunggu' }
  if (k.sudahLogin) return { jenis: 'pindah', ke: k.beranda || '/kontraktor' }
  return { jenis: 'pindah', ke: RUTA_MASUK }
}

/**
 * Apakah tautan-tautan halaman jualan pantas ditampilkan.
 *
 * Bukan hanya soal alamat pokok. Di dalam APK, tombol "Coba Gratis", "Lihat
 * Harga", dan tautan ke beranda pemasaran mengajak orang keluar dari
 * aplikasinya menuju halaman yang tidak ada gunanya bagi orang yang sudah
 * memasangnya.
 */
export function tampilkanJualan(diApk: boolean): boolean {
  return !diApk
}

/**
 * Apakah pendaftaran akun baru dilayani di sini.
 *
 * DI DALAM APK: tidak. Mendaftar berarti memilih paket, membaca syarat &
 * ketentuan, menerima email verifikasi, lalu membayar — rangkaian yang
 * dikerjakan sekali seumur akun, di depan komputer, oleh pemilik usaha.
 * Menaruhnya sebagai separuh layar pertama aplikasi berarti setiap mandor
 * yang membuka aplikasinya tiap pagi melihat tab yang tidak akan pernah ia
 * sentuh.
 *
 * Tombolnya tidak dihapus, hanya dialihkan ke situsnya — orang yang memang
 * mau mendaftar tetap harus punya jalan.
 */
export function bolehDaftarDiSini(diApk: boolean): boolean {
  return !diApk
}

/** Halaman pendaftaran di situs, untuk dibuka dari dalam APK. */
export function tautanDaftar(origin: string): string {
  const dasar = String(origin ?? '').replace(/\/+$/, '') || 'https://propfs.id'
  return `${dasar}/auth?tab=register`
}

/**
 * Bentuk form masuk: longgar di peramban, rapat di dalam APK.
 *
 * Bukan selera. Di peramban form ini berdiri di tengah layar lebar dan boleh
 * bernapas. Di HP, tiap milimeter yang dipakai hiasan adalah milimeter yang
 * mendorong tombol MASUK ke bawah garis lipatan — dan tombol yang harus
 * dicari dengan menggulung adalah tombol yang terasa rusak.
 */
export function kompakMasuk(diApk: boolean): boolean {
  return diApk
}

/**
 * Apakah form masuk harus DITAHAN dulu sementara sesi dipulihkan.
 *
 * Sejak APK menunjuk langsung ke `/auth`, halaman pertamanya adalah form
 * login — juga bagi orang yang sesinya masih hidup. Tanpa penahanan ini ia
 * melihat form login sepersekian detik sebelum dilempar ke berandanya, dan
 * kedipan itu dibaca sebagai "aku ter-logout lagi".
 *
 * HANYA pada pemuatan PERTAMA. `isLoading` juga menyala saat orang menekan
 * MASUK; menahan form di saat itu akan meng-unmount halamannya di tengah
 * proses dan menghapus email serta password yang sudah diketik — cacat yang
 * sudah pernah ada di berkas ini dan sengaja tidak diulang.
 *
 * Di peramban tidak ada yang berubah: halaman login memang dibuka orang yang
 * hendak mengetik, bukan oleh aplikasi yang baru dinyalakan.
 */
export function tungguSesiPertama(k: {
  diApk: boolean
  memuat: boolean
  pernahSelesai: boolean
}): boolean {
  return k.diApk && k.memuat && !k.pernahSelesai
}
