// ============================================================
// PropFS — jembatan ke cangkang Android
//
// Dipanggil SEKALI dari main.tsx, dan di web seluruhnya tidak berbuat apa-apa:
// `diAndroid()` bernilai false, fungsinya keluar sebelum menyentuh satu plugin
// pun, dan tidak ada satu paket Capacitor yang ikut ke bundel web karena
// semuanya di-import dinamis di dalam cabang native.
//
// Yang diurus di sini hanya hal-hal yang TIDAK ADA di peramban:
//
//   1. TOMBOL KEMBALI PERANGKAT. Ini yang paling penting. Tanpa penanganan,
//      satu ketukan tombol kembali MENUTUP aplikasi — dari halaman mana pun,
//      termasuk dari tengah pengisian form yang belum disimpan. Orang tidak
//      menganggap itu "perilaku bawaan"; mereka menganggap aplikasinya
//      keluar sendiri.
//   2. BILAH STATUS. Tanpa warna, ia putih dengan ikon putih di atas header
//      navy — jam dan sinyal menghilang.
//   3. SPLASH. Situsnya butuh sedetik-dua untuk muncul; tanpa splash, detik
//      itu terlihat sebagai layar putih kosong.
//
// Bagian yang bisa salah — keputusan apa yang dilakukan tombol kembali —
// dipisah menjadi fungsi murni supaya bisa diuji di Node tanpa perangkat.
// ============================================================

// Akhiran .ts eksplisit: uji Node dijalankan dengan --experimental-strip-types,
// yang tidak menebak akhiran berkas untuk impor nilai.
import { diAndroid } from './unduhBerkas.ts'

export type AksiKembali = 'tutup-dialog' | 'mundur' | 'kecilkan'

/**
 * Apa yang seharusnya dilakukan tombol kembali perangkat.
 *
 * Urutannya bukan selera: yang paling dekat dengan mata pemakainya ditutup
 * lebih dulu. Dialog yang sedang terbuka menutupi seluruh layar, dan menekan
 * kembali saat itu berarti "tutup ini" — bukan "tinggalkan halaman ini
 * beserta dialognya".
 *
 * KECILKAN, bukan keluar. `exitApp()` mematikan prosesnya: pemakainya kembali
 * dari layar Recents ke aplikasi yang memuat ulang dari nol dan lupa ia sedang
 * di mana. Meminimalkan membuat tombol kembali di halaman utama berperilaku
 * sama seperti tombol Home — yang memang itu maksudnya.
 */
export function aksiTombolKembali(keadaan: {
  adaDialog: boolean
  bisaMundur: boolean
}): AksiKembali {
  if (keadaan.adaDialog) return 'tutup-dialog'
  return keadaan.bisaMundur ? 'mundur' : 'kecilkan'
}

/**
 * Apakah ada lapisan terbuka yang seharusnya ditutup lebih dulu.
 *
 * `[role="dialog"]` adalah tanda baku yang dipasang komponen dialog aplikasi
 * ini. Lapisan buatan sendiri bisa ikut dengan menambahkan
 * `data-lapisan-terbuka` — sengaja lewat penanda yang ditulis dengan sadar,
 * bukan lewat tebakan atas nama kelas Tailwind, yang akan salah menutup
 * sesuatu setiap kali ada yang mengubah gaya.
 */
function adaDialogTerbuka(): boolean {
  try {
    return !!document.querySelector('[role="dialog"], [data-lapisan-terbuka]')
  } catch { return false }
}

/** Minta lapisan teratas menutup dirinya, dengan cara yang sama seperti Esc. */
function tutupDialogTeratas(): void {
  const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  document.dispatchEvent(ev)
  ;(document.activeElement ?? document.body).dispatchEvent(ev)
}

async function pasangTombolKembali(): Promise<void> {
  const { App } = await import('@capacitor/app')
  await App.addListener('backButton', ({ canGoBack }) => {
    switch (aksiTombolKembali({ adaDialog: adaDialogTerbuka(), bisaMundur: canGoBack })) {
      case 'tutup-dialog': tutupDialogTeratas(); break
      case 'mundur': window.history.back(); break
      case 'kecilkan': void App.minimizeApp(); break
    }
  })
}

async function pasangBilahStatus(): Promise<void> {
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  // Style.Dark = teks TERANG di atas latar gelap. Namanya menyesatkan dan
  // sudah salah dipasang di banyak proyek; yang dimaksud adalah gaya bilahnya,
  // bukan warna hurufnya.
  await StatusBar.setStyle({ style: Style.Dark })
  await StatusBar.setBackgroundColor({ color: '#0D1B2A' })
  await StatusBar.setOverlaysWebView({ overlay: false })
}

async function sembunyikanSplash(): Promise<void> {
  const { SplashScreen } = await import('@capacitor/splash-screen')
  await SplashScreen.hide()
}

/**
 * Siapkan perilaku native. Aman dipanggil di web — langsung keluar.
 *
 * Tidak pernah melempar: satu plugin yang gagal dimuat tidak boleh mencegah
 * aplikasinya tampil. Lebih baik APK tanpa warna bilah status daripada APK
 * yang menampilkan layar putih.
 */
export async function siapkanNative(): Promise<void> {
  if (!diAndroid()) return

  for (const pasang of [pasangTombolKembali, pasangBilahStatus, sembunyikanSplash]) {
    try {
      await pasang()
    } catch (e) {
      console.warn('[native] gagal menyiapkan:', e)
    }
  }
}
