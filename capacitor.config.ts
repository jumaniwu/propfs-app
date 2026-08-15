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
// HARGANYA, dan ini disengaja: APK ini WAJIB online. Tanpa internet ia
// menampilkan halaman kosong. Untuk aplikasi yang seluruh datanya memang ada
// di Supabase, itu pertukaran yang jujur.
// ============================================================

const config: CapacitorConfig = {
  appId: 'id.propfs.app',
  appName: 'PropFS',

  // Wajib ada walau tidak pernah dipakai selama `server.url` aktif. Isinya
  // satu halaman penjelasan, bukan hasil `npm run build` — sehingga membangun
  // APK TIDAK memerlukan satu rahasia pun: tanpa VITE_*, tanpa kunci Supabase
  // yang ikut terpaket ke dalam berkas yang dibagikan orang.
  webDir: 'android-shell',

  server: {
    url: 'https://propfs.id',
    androidScheme: 'https',
    cleartext: false,
    // Yang boleh dibuka DI DALAM aplikasi. Yang di luar daftar ini dilempar
    // ke peramban atau aplikasi lain — dan itu memang yang diinginkan untuk
    // wa.me dan mailto:, supaya WhatsApp yang membukanya, bukan WebView.
    allowNavigation: [
      'propfs.id',
      '*.propfs.id',
      '*.supabase.co',
    ],
  },

  android: {
    // Menampilkan halaman galat bawaan Android bila situsnya tidak terjangkau,
    // bukan layar putih tanpa keterangan.
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
