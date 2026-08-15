// ============================================================
// Jembatan ke cangkang Android.
//
// Yang diuji di sini praktis hanya satu keputusan — apa yang dilakukan tombol
// kembali perangkat — tetapi keputusan itu adalah satu-satunya bagian APK ini
// yang bisa membuat orang kehilangan pekerjaannya:
//
//   - Salah "keluar" → satu ketukan tak sengaja menutup aplikasi di tengah
//     pengisian form yang belum disimpan.
//   - Salah "mundur" saat dialog terbuka → pemakainya meninggalkan halaman
//     padahal ia hanya ingin menutup kotak yang menutupi layarnya.
//
// Sisa berkasnya (bilah status, splash) tidak diuji di sini karena tidak ada
// yang bisa dibuktikan tanpa perangkat sungguhan — dan karena kegagalannya
// sudah dijamin tertelan: yang gagal hanya kehilangan warna, bukan aplikasi.
// ============================================================
import { aksiTombolKembali, siapkanNative } from '../src/lib/jembatanNative.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Dialog terbuka menang atas apa pun ─────────────────────────────────────
//
// Dialog menutupi seluruh layar. Menekan kembali saat itu berarti "tutup ini",
// bukan "tinggalkan halaman ini beserta dialognya".
assert(aksiTombolKembali({ adaDialog: true, bisaMundur: true }) === 'tutup-dialog',
  'dialog ditutup lebih dulu, walau riwayat masih bisa dimundurkan')
assert(aksiTombolKembali({ adaDialog: true, bisaMundur: false }) === 'tutup-dialog',
  'dialog ditutup lebih dulu, walau tidak ada riwayat')

// ── Tanpa dialog: mundur bila bisa ─────────────────────────────────────────
assert(aksiTombolKembali({ adaDialog: false, bisaMundur: true }) === 'mundur',
  'mundur satu halaman')

// ── Di halaman pertama: KECILKAN, bukan keluar ─────────────────────────────
//
// Ini bedanya aplikasi yang enak dipakai dan aplikasi yang "keluar sendiri".
// exitApp() mematikan prosesnya — pemakainya kembali dari Recents ke aplikasi
// yang memuat ulang dari nol dan lupa ia sedang di mana.
assert(aksiTombolKembali({ adaDialog: false, bisaMundur: false }) === 'kecilkan',
  'di halaman pertama aplikasinya diminimalkan, TIDAK ditutup')

// Tidak ada satu jalur pun yang menghasilkan "keluar".
for (const adaDialog of [true, false]) {
  for (const bisaMundur of [true, false]) {
    const a = aksiTombolKembali({ adaDialog, bisaMundur })
    assert(['tutup-dialog', 'mundur', 'kecilkan'].includes(a), `aksi dikenal: ${a}`)
    assert(a !== 'keluar', 'tidak ada jalur yang menutup aplikasi')
  }
}

// ── Di web (dan di Node): siapkanNative tidak berbuat apa-apa ──────────────
//
// Kalau ia sampai mencoba memuat plugin Capacitor di web, seluruh aplikasi
// gagal dimuat. Di Node paket-paket itu bahkan tidak bisa di-resolve, jadi
// selesai tanpa melempar sekaligus membuktikan cabang native tidak tersentuh.
{
  let melempar = false
  try { await siapkanNative() } catch { melempar = true }
  assert(!melempar, 'di luar APK: selesai diam-diam, tanpa memuat plugin apa pun')
}

console.log(`jembatan-native: ${ok} assert lulus`)
