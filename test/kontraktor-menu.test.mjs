// Test katalog menu Home Kontraktor AI: penggabungan ikon, tujuan, & pencarian.
import {
  MENU_ITEMS, KATEGORI, cariMenu, targetUrl, butuhProyek,
} from '../src/lib/kontraktorMenu.ts'
import { MENU_KE_MODUL } from '../src/lib/teamRoles.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const cari = (q) => cariMenu(MENU_ITEMS, q).map(i => i.label)
const item = (key) => MENU_ITEMS.find(i => i.key === key)

// ── Bentuk katalog ─────────────────────────────────────────────────────────
assert(MENU_ITEMS.length === 20, `20 ikon (kini ${MENU_ITEMS.length})`)

// tidak ada key ganda
const keys = MENU_ITEMS.map(i => i.key)
assert(new Set(keys).size === keys.length, 'tidak ada key kembar')

// tidak ada label ganda — dulu beberapa ikon bermuara ke halaman yang sama
const labels = MENU_ITEMS.map(i => i.label)
assert(new Set(labels).size === labels.length, 'tidak ada label kembar')

// Inti perbaikan: tidak ada dua ikon dengan tujuan yang sama.
const tujuan = MENU_ITEMS.map(i => targetUrl(i, 'p1'))
assert(new Set(tujuan).size === tujuan.length,
  `tiap ikon menuju halaman berbeda (ada duplikat: ${tujuan.filter((t, n) => tujuan.indexOf(t) !== n).join(', ')})`)

// setiap item punya tepat satu tujuan: tab workspace ATAU path langsung
for (const i of MENU_ITEMS) {
  assert(!!i.tab !== !!i.path, `${i.key} punya tepat satu tujuan (tab atau path)`)
  assert(!!i.tone, `${i.key} punya warna`)
  assert(KATEGORI.some(k => k.key === i.kategori), `kategori ${i.key} dikenal`)
}

// Pengaturan selalu paling belakang
assert(MENU_ITEMS[MENU_ITEMS.length - 1].key === 'settings', 'Pengaturan di urutan terakhir')

// ── Penggabungan yang diminta ──────────────────────────────────────────────
assert(item('tim')?.label === 'User Team', 'menu tim bernama User Team')
assert(!item('tim_undang') && !item('tim_role'), 'Undang Anggota & Role & Akses sudah menyatu')
assert(!item('pemasukan') && !item('inventori') && !item('opname'),
  'Pemasukan, Inventori, Opname menyatu ke Akuntan')
assert(item('akuntan')?.label === 'Akuntan', 'ikon keuangan bernama Akuntan')
assert(!item('kalender') && !item('link_pekerja'), 'Kalender Progres & Link Pekerja menyatu')
assert(item('lapangan')?.label === 'Laporan Lapangan', 'ikon lapangan bernama Laporan Lapangan')
assert(!item('pakai_bahan') && !item('req_bahan'), 'Pakai & Request Material menyatu')
assert(item('material_lapangan')?.label === 'Material Lapangan', 'ikon material lapangan ada')
assert(item('procurement')?.label === 'Procurement', 'ikon Procurement ada')
assert(item('procurement')?.path === '/kontraktor/procurement', 'Procurement menuju halamannya sendiri')

// Feasibility Study turun dari produk terpisah menjadi fitur tambahan di sini.
assert(item('feasibility')?.path === '/dashboard', 'Feasibility Study memakai halaman lamanya')
assert(item('feasibility')?.tambahan === 'fs_module', 'Feasibility Study digerbangi setelan backend')
assert(MENU_ITEMS.filter(i => i.tambahan).length === 1, 'baru satu fitur tambahan')

// Cari Leads: form publik untuk calon konsumen.
assert(item('leads')?.path === '/kontraktor/leads', 'Cari Leads menuju halamannya sendiri')
assert(item('leads')?.kategori === 'tim', 'Cari Leads berdiri di kategori Tim')

// ── Pencarian: label lama harus tetap menemukan ikon gabungannya ───────────
const petaCari = {
  opname: 'Akuntan', pemasukan: 'Akuntan', inventori: 'Akuntan', neraca: 'Akuntan',
  'laba rugi': 'Akuntan',
  undang: 'User Team', role: 'User Team', invite: 'User Team', 'anggota tim': 'User Team',
  kalender: 'Laporan Lapangan', 'link pekerja': 'Laporan Lapangan', mandor: 'Laporan Lapangan',
  request: 'Material Lapangan', kekurangan: 'Material Lapangan', 'pakai material': 'Material Lapangan',
  'google drive': 'Pengaturan',
  vendor: 'Procurement', supplier: 'Procurement', 'purchase order': 'Procurement',
  pengadaan: 'Procurement',
  'studi kelayakan': 'Feasibility Study', irr: 'Feasibility Study',
  'calon konsumen': 'Cari Leads', prospek: 'Cari Leads', marketing: 'Cari Leads',
}
for (const [kata, label] of Object.entries(petaCari)) {
  assert(cari(kata).includes(label), `cari "${kata}" menemukan ${label}`)
}

// urutan kata tidak berpengaruh
assert(cari('material request')[0] === cari('request material')[0],
  'urutan kata tidak mengubah hasil')
// huruf besar/kecil tidak berpengaruh
assert(cari('OPNAME').includes('Akuntan'), 'pencarian tidak peka huruf besar')
// kata yang tidak ada
assert(cari('zzzz').length === 0, 'kata tak dikenal tidak menghasilkan apa pun')
// kueri kosong mengembalikan semua
assert(cariMenu(MENU_ITEMS, '').length === MENU_ITEMS.length, 'kueri kosong = semua menu')
assert(cariMenu(MENU_ITEMS, '   ').length === MENU_ITEMS.length, 'kueri spasi saja = semua menu')

// ── targetUrl & butuhProyek ────────────────────────────────────────────────
assert(targetUrl(item('tim')) === '/kontraktor/tim', 'menu lintas proyek memakai path langsung')
assert(butuhProyek(item('rab')) === true, 'RAB butuh proyek aktif')
assert(butuhProyek(item('tim')) === false, 'User Team tidak butuh proyek aktif')
assert(targetUrl(item('rab'), 'p9').includes('project=p9'), 'projectId ikut di URL')
assert(targetUrl(item('akuntan'), 'p9').includes('tab=akuntan'), 'tab tujuan ikut di URL')

// ── Setiap menu harus terpetakan ke modul untuk penyaringan role ───────────
for (const i of MENU_ITEMS) {
  assert(!!MENU_KE_MODUL[i.key], `${i.key} terpetakan di MENU_KE_MODUL`)
}
// dan sebaliknya: tidak ada sisa pemetaan menu yang sudah dihapus
for (const key of Object.keys(MENU_KE_MODUL)) {
  assert(keys.includes(key), `MENU_KE_MODUL tidak menyimpan menu usang (${key})`)
}

console.log(`✅ kontraktorMenu: ${ok} assertion lolos`)
