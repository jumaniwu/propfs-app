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


/**
 * Berapa lama gerbang rute boleh menahan halaman pada pembukaan PERTAMA.
 *
 * Pemeriksaan sesi oleh supabase-js menyentuh jaringan: pada sinyal buruk ia
 * bisa memakan belasan detik, dan selama itu SELURUH halaman privat tidak
 * dirender sama sekali. Yang terlihat pemakai lingkaran berputar yang tidak
 * pernah berubah — dan halaman di baliknya tidak pernah sempat menunjukkan
 * apa pun, termasuk salinan yang sudah ada di perangkatnya.
 */
export const BATAS_GERBANG_MS = 4_000

/**
 * Masih boleh menahan halaman?
 *
 * Tiga syarat, dan ketiganya harus benar. Sesi memang sedang dimuat; ini
 * pemuatan PERTAMA — bukan penyegaran token yang berulang, yang dulu
 * mengembalikan setiap halaman ke lingkaran berputar berkali-kali; dan
 * penantiannya belum melewati batas.
 *
 * Sesudah batas itu halaman dilepas apa adanya. Bila ternyata memang belum
 * login, gerbang berikutnya yang mengarahkannya ke halaman masuk — dan itu
 * jawaban yang jelas, jauh lebih berguna daripada menunggu tanpa akhir.
 */
export function gerbangMenahan(k: {
  memuat: boolean
  pernahSelesai: boolean
  lamaMs: number
  batasMs?: number
}): boolean {
  if (!k.memuat || k.pernahSelesai) return false
  return (Number(k.lamaMs) || 0) < (k.batasMs ?? BATAS_GERBANG_MS)
}


/**
 * Apakah perangkat ini menyimpan sesi login.
 *
 * Dibaca dari laci yang sama dengan klien Supabase, dan TIDAK menyentuh
 * jaringan. Gunanya satu: membedakan "sedang memeriksa sesi milik orang yang
 * memang sudah login" dari "memang belum login".
 *
 * Pembedaan itu penting karena jalan keluarnya berlawanan. Yang pertama harus
 * dibiarkan masuk — halamannya punya salinan di perangkat dan bisa langsung
 * berguna. Yang kedua harus diarahkan ke halaman masuk. Menahan keduanya
 * dengan lingkaran berputar, seperti sebelumnya, melayani yang kedua dan
 * menghukum yang pertama.
 *
 * Ini BUKAN pemberian izin. Isi sesinya tidak diperiksa, tidak dipercaya, dan
 * tidak dipakai untuk apa pun selain memutuskan apa yang digambar sambil
 * menunggu. Izin sebenarnya tetap ditentukan server lewat RLS.
 */
/**
 * Berapa lama sesi tersimpan boleh dipakai sebagai izin sementara.
 *
 * Cukup panjang untuk melewati pemeriksaan sesi yang lambat, cukup pendek
 * sehingga sesi yang benar-benar sudah mati tidak membuat aplikasi terbuka
 * tanpa pengguna selamanya.
 */
export const BATAS_SESI_TERSIMPAN_MS = 30_000

export function adaSesiTersimpan(kunci: string): boolean {
  try {
    if (typeof localStorage === 'undefined' || !kunci) return false
    const mentah = localStorage.getItem(kunci)
    if (!mentah) return false
    const p = JSON.parse(mentah)
    return !!(p?.access_token || p?.currentSession?.access_token || p?.session?.access_token)
  } catch { return false }
}
