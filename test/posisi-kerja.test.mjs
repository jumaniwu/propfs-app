// Test posisi kerja yang tercatat di alamat, supaya muat ulang tidak
// melempar pemakainya kembali ke daftar proyek.
import { bacaPosisi, tulisPosisi, samaPosisi, subSah, TAB_KERJA } from '../src/lib/posisiKerja.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Keadaan yang dilaporkan: muat ulang di tengah pekerjaan ───────────────
{
  // Alamat inilah yang harus bertahan melewati F5. Sebelum perbaikan, alamatnya
  // sudah dikosongkan jadi `/cost-control` saja dan tidak menyebut apa pun.
  const p = bacaPosisi('?project=ruko&tab=realisasi')
  assert(p.proyek === 'ruko', 'proyek yang sedang dibuka terbaca dari alamat')
  assert(p.tab === 'realisasi', 'menu yang sedang dibuka terbaca dari alamat')
}
{
  // Bolak-balik: apa yang ditulis harus terbaca kembali persis sama.
  const asli = { proyek: 'ruko', tab: 'akuntan', sub: 'hutang' }
  const kembali = bacaPosisi(tulisPosisi(asli))
  assert(kembali.proyek === 'ruko' && kembali.tab === 'akuntan' && kembali.sub === 'hutang',
    'posisi ditulis lalu dibaca kembali utuh')
}

// ── Alamat yang tidak masuk akal tidak boleh menghasilkan layar kosong ────
assert(bacaPosisi('?tab=xyz').tab === undefined,
  'menu yang tidak dikenal diabaikan, bukan diteruskan hingga tak ada yang cocok')
assert(bacaPosisi('?tab=').tab === undefined, 'menu kosong diabaikan')
assert(bacaPosisi('?tab=RAB').tab === undefined,
  'beda huruf besar-kecil bukan menu yang sama — jangan menebak')
assert(bacaPosisi('?project=').proyek === undefined, 'proyek kosong diabaikan')
assert(bacaPosisi('?project=%20%20').proyek === undefined, 'proyek berisi spasi saja diabaikan')
assert(bacaPosisi('').tab === undefined, 'alamat kosong aman')
assert(bacaPosisi(null).proyek === undefined, 'null aman')
assert(bacaPosisi(undefined).sub === undefined, 'undefined aman')
assert(Object.keys(bacaPosisi('?lain=1')).length === 0, 'parameter asing tidak ikut terbaca')

// Spasi di tepi (sering terjadi saat tautan disalin lewat WhatsApp).
assert(bacaPosisi('?project=%20ruko%20').proyek === 'ruko', 'spasi di tepi id proyek dipangkas')

// ── tulisPosisi ──────────────────────────────────────────────────────────
assert(tulisPosisi({ proyek: 'ruko', tab: 'rab' }).toString() === 'project=ruko&tab=rab',
  'urutan kuncinya tetap: project, tab, sub')
assert(tulisPosisi({ tab: 'akuntan', sub: 'hutang', proyek: 'a' }).toString() === 'project=a&tab=akuntan&sub=hutang',
  'urutannya tidak ikut urutan penulisan objek')
assert(tulisPosisi({}).toString() === '', 'posisi kosong menghasilkan alamat bersih')
assert(tulisPosisi().toString() === '', 'tanpa masukan aman')
assert(tulisPosisi({ proyek: 'ruko', sub: '' }).toString() === 'project=ruko',
  'bagian kosong tidak ditulis — hanya memanjangkan alamat tanpa keterangan')
assert(tulisPosisi({ tab: 'ngawur' }).toString() === '', 'menu tak dikenal tidak ikut ditulis')
{
  // Id proyek bisa mengandung karakter yang harus disandikan.
  const q = tulisPosisi({ proyek: 'proyek a&b' })
  assert(bacaPosisi(q).proyek === 'proyek a&b', 'id proyek aneh tetap utuh bolak-balik')
}

// ── samaPosisi: penjaga agar alamat tidak ditulis berulang ───────────────
// Tanpa ini, setiap render menulis ulang alamat yang isinya sama — riwayat
// peramban membengkak dan tombol kembali berhenti berguna.
assert(samaPosisi('project=ruko&tab=rab', { proyek: 'ruko', tab: 'rab' }) === true,
  'alamat yang sudah menggambarkan posisi ini dikenali sama')
assert(samaPosisi('project=ruko&tab=rab', { proyek: 'ruko', tab: 'akuntan' }) === false,
  'menu berbeda dikenali berbeda')
assert(samaPosisi('', {}) === true, 'sama-sama kosong')
assert(samaPosisi('?project=ruko', {}) === false, 'ada proyek vs tidak ada dikenali berbeda')
assert(samaPosisi(new URLSearchParams('project=ruko'), { proyek: 'ruko' }) === true,
  'menerima URLSearchParams langsung')

// ── Semua menu di sidebar bisa dibawa di alamat ──────────────────────────
for (const t of TAB_KERJA) {
  assert(bacaPosisi(tulisPosisi({ tab: t })).tab === t, `menu "${t}" bertahan bolak-balik`)
}
assert(TAB_KERJA.length === 10, 'sepuluh menu workspace')
assert(new Set(TAB_KERJA).size === TAB_KERJA.length, 'tidak ada menu kembar')

// ── subSah: sub-menu halaman di luar workspace ───────────────────────────
assert(subSah('katalog', ['vendor', 'katalog', 'po'], 'vendor') === 'katalog', 'sub-menu yang sah dipakai')
assert(subSah('ngawur', ['vendor', 'katalog'], 'vendor') === 'vendor', 'sub-menu tak dikenal jatuh ke bawaan')
assert(subSah(null, ['vendor'], 'vendor') === 'vendor', 'null jatuh ke bawaan')
assert(subSah(undefined, ['a', 'b'], 'b') === 'b', 'undefined jatuh ke bawaan')
assert(subSah('  po  ', ['po'], 'vendor') === 'po', 'spasi di tepi dipangkas dulu')
assert(subSah('', ['a'], 'a') === 'a', 'teks kosong jatuh ke bawaan')

console.log(`posisi-kerja: ${ok} assert lulus`)
