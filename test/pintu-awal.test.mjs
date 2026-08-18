// ============================================================
// Pintu masuk alamat pokok.
//
// Dua hal yang dijaga di sini, dan keduanya adalah cara mudah merusak sesuatu
// yang sudah berjalan:
//
//   1. DI PERAMBAN TIDAK BOLEH ADA YANG BERUBAH. propfs.id adalah satu-satunya
//      cara pemakai baru datang, dan halamannya harus tampil seketika —
//      termasuk bagi Google, yang tidak pernah punya sesi.
//   2. DI APK TIDAK BOLEH ADA KEDIPAN. Memutuskan sebelum sesi selesai dibaca
//      akan melempar pemakai yang sudah login ke halaman masuk, lalu
//      menariknya kembali — dan orang membacanya sebagai "aku ter-logout lagi".
// ============================================================
import {
  tujuanAwal, tampilkanJualan, bolehDaftarDiSini, tautanDaftar, kompakMasuk,
  tungguSesiPertama, RUTA_MASUK,
} from '../src/lib/pintuAwal.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const web = (p = {}) => tujuanAwal({ diApk: false, memuat: false, sudahLogin: false, beranda: '/kontraktor', ...p })
const apk = (p = {}) => tujuanAwal({ diApk: true, memuat: false, sudahLogin: false, beranda: '/kontraktor', ...p })

// ── 1. Di peramban: SELALU halaman jualan, apa pun keadaannya ─────────────
//
// Termasuk saat sesi masih dimuat: menunda halaman jualan demi sesi berarti
// mesin pengindeks Google melihat layar kosong.
assert(web().jenis === 'landing', 'belum login')
assert(web({ sudahLogin: true }).jenis === 'landing', 'sudah login pun tetap landing')
assert(web({ memuat: true }).jenis === 'landing', 'tidak menunggu sesi')
assert(web({ memuat: true, sudahLogin: true }).jenis === 'landing', 'apa pun keadaannya')
assert(web({ beranda: '' }).jenis === 'landing', 'beranda kosong tidak berpengaruh')

// ── 2. Di APK: tunggu sesi dulu ────────────────────────────────────────────
assert(apk({ memuat: true }).jenis === 'tunggu', 'sesi masih dibaca: tidak memutuskan apa pun')
assert(apk({ memuat: true, sudahLogin: true }).jenis === 'tunggu', 'walau sudah login')

// ── 3. Di APK: sudah login → langsung ke pekerjaannya ─────────────────────
{
  const t = apk({ sudahLogin: true })
  assert(t.jenis === 'pindah' && t.ke === '/kontraktor', 'ke beranda pemakainya')

  const lain = apk({ sudahLogin: true, beranda: '/dashboard' })
  assert(lain.ke === '/dashboard', 'beranda mengikuti hak aksesnya, bukan dipatok')

  // Beranda kosong bukan alasan mendarat di halaman kosong.
  const hampa = apk({ sudahLogin: true, beranda: '' })
  assert(hampa.jenis === 'pindah' && hampa.ke === '/kontraktor', `ada cadangan: ${hampa.ke}`)
}

// ── 4. Di APK: belum login → halaman masuk, bukan halaman jualan ──────────
{
  const t = apk()
  assert(t.jenis === 'pindah' && t.ke === RUTA_MASUK, `ke ${RUTA_MASUK}, dapat ${t.ke}`)
  assert(RUTA_MASUK === '/auth', 'alamatnya tetap yang sudah ada')
}

// Tidak ada satu jalur pun di APK yang berakhir di halaman jualan.
for (const memuat of [true, false]) {
  for (const sudahLogin of [true, false]) {
    const t = tujuanAwal({ diApk: true, memuat, sudahLogin, beranda: '/kontraktor' })
    assert(t.jenis !== 'landing', `APK tidak pernah menampilkan halaman jualan (${memuat}/${sudahLogin})`)
  }
}

// ── 5. Tautan pemasaran ────────────────────────────────────────────────────
assert(tampilkanJualan(false) === true, 'di web: tombol Coba Gratis tetap ada')
assert(tampilkanJualan(true) === false, 'di APK: tidak mengajak orang keluar dari aplikasinya')

// ── 6. Pendaftaran ────────────────────────────────────────────────────────
//
// Mendaftar = pilih paket, baca syarat, tunggu email verifikasi, bayar.
// Sekali seumur akun, di depan komputer. Di dalam APK ia hanya menjadi tab
// yang tidak akan pernah disentuh mandor yang membuka aplikasi tiap pagi.
assert(bolehDaftarDiSini(false) === true, 'di web: daftar dilayani di tempat')
assert(bolehDaftarDiSini(true) === false, 'di APK: dialihkan ke situs')

assert(tautanDaftar('https://propfs.id') === 'https://propfs.id/auth?tab=register', 'tautan daftar')
assert(tautanDaftar('https://propfs.id/') === 'https://propfs.id/auth?tab=register', 'garis miring ujung dibuang')
assert(tautanDaftar('http://localhost:5173') === 'http://localhost:5173/auth?tab=register',
  'localhost tetap bisa dipakai saat mengembangkan')
// Origin kosong tidak boleh menghasilkan tautan relatif yang, dibuka dari
// dalam APK, menunjuk ke tempat yang bukan situsnya.
assert(tautanDaftar('') === 'https://propfs.id/auth?tab=register', 'origin kosong punya cadangan')
assert(tautanDaftar(null) === 'https://propfs.id/auth?tab=register', 'null aman')

// ── 7. Kerapatan form ─────────────────────────────────────────────────────
assert(kompakMasuk(true) === true, 'di APK: rapat')
assert(kompakMasuk(false) === false, 'di web: longgar seperti sebelumnya')

// ── 8. Menahan form masuk saat sesi dipulihkan ────────────────────────────
//
// Sejak APK menunjuk langsung ke /auth, halaman pertamanya form login — juga
// bagi yang sesinya masih hidup. Tanpa penahanan, ia melihat form login
// sepersekian detik sebelum dilempar ke berandanya, dan kedipan itu dibaca
// sebagai "aku ter-logout lagi".
assert(tungguSesiPertama({ diApk: true, memuat: true, pernahSelesai: false }) === true,
  'APK, pemuatan pertama, sesi belum terbaca: tahan')
assert(tungguSesiPertama({ diApk: true, memuat: false, pernahSelesai: false }) === false,
  'sesi sudah terbaca: tampilkan')

// HANYA pemuatan pertama. isLoading juga menyala saat orang menekan MASUK;
// menahan form di saat itu meng-unmount halamannya dan menghapus email serta
// password yang sudah diketik — cacat yang sudah pernah ada dan tidak diulang.
assert(tungguSesiPertama({ diApk: true, memuat: true, pernahSelesai: true }) === false,
  'sedang menekan MASUK: JANGAN ditahan, ketikannya akan hilang')

// Di peramban tidak ada yang berubah.
for (const memuat of [true, false]) {
  for (const pernahSelesai of [true, false]) {
    assert(tungguSesiPertama({ diApk: false, memuat, pernahSelesai }) === false,
      `di web tidak pernah ditahan (${memuat}/${pernahSelesai})`)
  }
}

console.log(`pintu-awal: ${ok} assert lulus`)
