// Test navigasi bawah: isinya, dan item mana yang menyala di tiap jalur.
import { ITEM_NAV, TANPA_NAV, navTampil, itemAktif } from '../src/lib/navBawah.ts'
import { POLA_TAUTAN, jalurTautan } from '../src/lib/tautanPendek.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const aktif = (jalur) => itemAktif(ITEM_NAV, jalur)?.label

// ── Isi navigasi ───────────────────────────────────────────────────────────
assert(ITEM_NAV.length === 4, `empat tombol (kini ${ITEM_NAV.length})`)
assert(ITEM_NAV.map(i => i.label).join(',') === 'Beranda,Chat AI,Chat Tim,Profil', 'urutan tombol')

// Yang diminta hilang memang hilang sebagai TUJUAN tombol.
const tujuan = ITEM_NAV.map(i => i.path)
assert(!tujuan.includes('/home'), 'Beranda akun bukan lagi tujuan tombol')
assert(!tujuan.includes('/dashboard'), 'Feasibility Study tidak punya tombol lagi')
assert(!tujuan.includes('/siteplan'), 'AI Architect tidak punya tombol lagi')
assert(tujuan[0] === '/kontraktor', 'Beranda menuju Home Kontraktor AI')
assert(tujuan[1] === '/kontraktor/chat', 'tombol kedua adalah Chat AI')
assert(tujuan[2] === '/kontraktor/tim-chat', 'tombol ketiga adalah Chat Tim')

// Tidak ada dua tombol dengan tujuan sama.
assert(new Set(tujuan).size === tujuan.length, 'tiap tombol menuju halaman berbeda')

// ── itemAktif: kecocokan terpanjang yang menang ────────────────────────────
assert(aktif('/kontraktor') === 'Beranda', 'home kontraktor menyalakan Beranda')
assert(aktif('/kontraktor/chat') === 'Chat AI', 'chat menyalakan Chat AI, bukan Beranda')
assert(aktif('/kontraktor/tim-chat') === 'Chat Tim', 'chat tim menyalakan Chat Tim, bukan Beranda')
assert(aktif('/kontraktor/procurement') === 'Beranda', 'halaman modul lain tetap Beranda')
assert(aktif('/cost-control') === 'Beranda', 'workspace proyek menyalakan Beranda')
assert(aktif('/cost-report/p1') === 'Beranda', 'laporan proyek menyalakan Beranda')
assert(aktif('/profile') === 'Profil', 'profil menyalakan Profil')
assert(aktif('/pricing') === 'Profil', 'harga masih di bawah Profil')

// Halaman yang tombolnya dicabut tetap menyalakan sesuatu — navigasi yang
// seluruhnya padam membuat pemakainya merasa tersesat.
assert(aktif('/home') === 'Beranda', 'beranda akun lama tetap menyalakan Beranda')
assert(aktif('/dashboard') === 'Beranda', 'Feasibility Study menyalakan Beranda')
assert(aktif('/siteplan') === 'Beranda', 'AI Architect menyalakan Beranda')
assert(aktif('/input/p1') === 'Beranda', 'halaman input FS menyalakan Beranda')

// Kecocokan berhenti di batas ruas jalur.
assert(aktif('/kontraktorku') === undefined, '/kontraktor tidak mengklaim /kontraktorku')
assert(aktif('/profiles') === undefined, '/profile tidak mengklaim /profiles')
assert(aktif('/entah') === undefined, 'jalur asing tidak menyalakan apa pun')
assert(itemAktif([], '/kontraktor') === undefined, 'daftar kosong aman')
assert(itemAktif(ITEM_NAV, '') === undefined, 'jalur kosong aman')

// ── navTampil ──────────────────────────────────────────────────────────────
assert(navTampil('/kontraktor', true) === true, 'tampil saat sudah masuk')
assert(navTampil('/kontraktor', false) === false, 'belum masuk berarti tidak tampil')
assert(navTampil('/', true) === false, 'landing tanpa navigasi')
for (const p of TANPA_NAV) {
  assert(navTampil(p, true) === false, `${p} tanpa navigasi`)
  assert(navTampil(`${p}/apa`, true) === false, `anak ${p} tanpa navigasi`)
}
assert(navTampil('/adminx', true) === true, '/admin tidak mengklaim /adminx')
assert(navTampil('/legalitas', true) === true, '/legal tidak mengklaim /legalitas')

// ── Halaman publik bertoken: TIDAK PERNAH menampilkan navigasi ─────────────
// Yang membukanya tukang, vendor, dan calon konsumen — orang luar tanpa akun.
// Menawarkan menu Kontraktor AI kepada mereka hanya melempar ke halaman login.
for (const jenis of Object.keys(POLA_TAUTAN)) {
  for (const jalur of jalurTautan(jenis)) {
    assert(navTampil(`${jalur}/K7M2P9QR4T6V`, true) === false,
      `${jenis}: ${jalur}/<token> tanpa navigasi walau pemiliknya sedang login`)
  }
}
// Termasuk yang paling mudah terlewat: form leads yang baru ditambahkan.
assert(navTampil('/k/K7M2P9QR4T6V', true) === false, 'form leads tanpa navigasi')
assert(navTampil('/leads/K7M2P9QR4T6V', true) === false, 'jalur lama form leads juga')
// Tapi halaman aplikasi yang kebetulan berawalan mirip tidak ikut kena.
assert(navTampil('/kontraktor/leads', true) === true, 'halaman pengelolaan leads TETAP bernavigasi')

console.log(`nav-bawah: ${ok} assert lulus`)
