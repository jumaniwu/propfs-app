import type { CapacitorConfig } from '@capacitor/cli'

// ============================================================
// PropFS — cangkang Android
//
// APK ini TIDAK membawa salinan aplikasinya. Ia membuka situs yang sudah
// berjalan di https://propfs.id.
//
// Alasannya bukan kemalasan, melainkan satu hal yang menentukan: aplikasi ini
// membangun tautan publik dari `window.location.origin` di sembilan tempat —
// tautan kwitansi konsumen, PO vendor, invoice, tanda tangan SPK, laporan
// lapangan — dan memanggil `/api/…` secara relatif di empat tempat.
//
// APK yang membawa salinan menjalankan halamannya dari `capacitor://localhost`.
// Origin itulah yang akan ikut tercetak di setiap tautan yang dikirim ke
// konsumen dan vendor lewat WhatsApp. Artinya: setiap kwitansi yang dikirim
// dari HP akan membawa tautan yang tidak bisa dibuka siapa pun, dan tidak ada
// yang menyadarinya sampai konsumen mengeluh.
//
// Dengan `server.url`, origin tetap `https://propfs.id`. Ketiga belas titik
// itu tidak perlu disentuh sama sekali, dan pembaruan situs langsung sampai
// ke APK tanpa merilis ulang.
//
// HARGANYA, dan ini disengaja: APK ini WAJIB online. Untuk aplikasi yang
// seluruh datanya memang ada di Supabase, itu pertukaran yang jujur — dan
// ketika jaringannya mati, yang tampil adalah android-shell/gagal.html
// (lihat server.errorPath), bukan halaman galat mentah Chrome.
// ============================================================

/**
 * Penanda di User-Agent — INILAH cara aplikasi web tahu ia sedang berjalan
 * di dalam APK.
 *
 * Cara bawaannya, `window.Capacitor.isNativePlatform()`, TIDAK BISA DIPAKAI
 * di sini. Objek itu disuntikkan Capacitor lewat server lokalnya, dan server
 * lokal itu hanya melayani berkas dari `webDir`. Halaman kita datang dari
 * https://propfs.id — origin lain sama sekali — jadi penyuntikannya tidak
 * pernah sampai, atau sampai terlambat setelah React memutuskan mau
 * menampilkan apa.
 *
 * Akibatnya persis yang terlihat: APK terbuka di halaman jualan, seolah ia
 * peramban biasa.
 *
 * User-Agent tidak punya masalah itu. Ia ditetapkan WebView sebelum satu byte
 * pun diminta, berlaku di origin mana pun, dan terbaca serentak — tidak ada
 * jendela waktu tempat jawabannya masih "belum tahu".
 */
export const PENANDA_APK = 'PropFSApp'

const config: CapacitorConfig = {
  appId: 'id.propfs.app',
  appName: 'PropFS',

  // Ditambahkan ke User-Agent WebView, mis.
  //   Mozilla/5.0 (Linux; Android 14; …) … Chrome/… PropFSApp
  appendUserAgent: PENANDA_APK,

  // Wajib ada walau tidak pernah dipakai selama `server.url` aktif. Isinya
  // satu halaman penjelasan, bukan hasil `npm run build` — sehingga membangun
  // APK TIDAK memerlukan satu rahasia pun: tanpa VITE_*, tanpa kunci Supabase
  // yang ikut terpaket ke dalam berkas yang dibagikan orang.
  webDir: 'android-shell',

  server: {
    url: 'https://propfs.id',
    androidScheme: 'https',
    cleartext: false,

    // Halaman yang ditampilkan bila situsnya TIDAK TERJANGKAU.
    //
    // Tanpanya, HP yang sedang tidak punya DNS menampilkan halaman Chrome
    // mentah: "Halaman web tidak tersedia — net::ERR_NAME_NOT_RESOLVED".
    // Pengawas yang membacanya menyimpulkan APLIKASINYA rusak lalu menelepon
    // kantor, padahal yang perlu dilakukannya hanya menyalakan data.
    //
    // Dimuat dari server LOKAL di dalam APK (Bridge.getErrorUrl menyusunnya
    // sebagai scheme://host/<errorPath>), jadi ia tetap tampil justru ketika
    // internetnya mati — dan karena itu isinya wajib berdiri sendiri, tanpa
    // satu pun permintaan jaringan.
    errorPath: 'gagal.html',
    // Yang boleh dibuka DI DALAM aplikasi. Yang di luar daftar ini dilempar
    // ke peramban atau aplikasi lain — dan itu memang yang diinginkan untuk
    // wa.me dan mailto:, supaya WhatsApp yang membukanya, bukan WebView.
    allowNavigation: [
      'propfs.id',
      // www ikut didaftarkan: apex dan www melayani aplikasi yang sama, dan
      // salah satunya bisa mengalihkan ke yang lain. Alamat yang tidak
      // terdaftar akan dilempar ke peramban luar — aplikasinya "keluar
      // sendiri" hanya karena satu pengalihan.
      'www.propfs.id',
      '*.propfs.id',
      '*.supabase.co',
    ],
  },

  android: {
    // Diulang di sini: sebagian versi Capacitor hanya membaca yang di dalam
    // blok platform, dan penanda yang hilang berarti aplikasinya kembali
    // menyangka dirinya peramban.
    appendUserAgent: PENANDA_APK,
    // Inspeksi WebView dari komputer, dimatikan untuk APK yang dibagikan.
    // (Halaman saat situsnya tidak terjangkau diatur server.errorPath di atas,
    // bukan di sini — komentar lama di baris ini keliru menyebutnya.)
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      // Situsnya butuh sedetik-dua untuk muncul. Tanpa splash, yang terlihat
      // di detik itu adalah layar putih kosong — yang terbaca sebagai aplikasi
      // rusak, bukan aplikasi sedang memuat.
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0D1B2A',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0D1B2A',
      overlaysWebView: false,
    },
  },
}

export default config
