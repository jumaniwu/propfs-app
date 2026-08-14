// Test branding laporan: identitas perusahaan menggantikan PropFS pada setiap
// dokumen, dan TIDAK ADA watermark di mana pun.
//
// Watermark "PropFS — Versi Gratis" dihapus seluruhnya. Sistem ini hanya bisa
// dipakai setelah berlangganan, jadi tidak ada versi lain untuk dibedakan —
// dan menempelkan penanda produk pada surat orang, di hadapan konsumen dan
// pemasoknya, tidak pernah pantas.
import * as branding from '../src/lib/branding.ts'
import {
  identitasLaporan, footerLaporan, kopLaporan, PROFIL_KOSONG,
} from '../src/lib/branding.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Identitas: PropFS hanya dipakai bila profil belum diisi ────────────────
const kosong = identitasLaporan(PROFIL_KOSONG)
assert(kosong.bawaan === true, 'profil kosong memakai identitas bawaan')
assert(kosong.nama === 'PropFS', 'identitas bawaan bernama PropFS')

assert(identitasLaporan(null).bawaan === true, 'profil null aman')
assert(identitasLaporan(undefined).bawaan === true, 'profil undefined aman')
assert(identitasLaporan({ ...PROFIL_KOSONG, nama: '   ' }).bawaan === true,
  'nama berisi spasi saja tetap dianggap belum diisi')

const pt = {
  nama: 'PT Propfs Karya Utama',
  logo: 'data:image/png;base64,AAA',
  alamat: 'Jl. Merdeka No. 1, Bekasi',
  telepon: '021-1234567',
  email: 'admin@karyautama.co.id',
  website: 'karyautama.co.id',
  npwp: '01.234.567.8-901.000',
}
const id = identitasLaporan(pt)
assert(id.bawaan === false, 'profil terisi tidak lagi memakai identitas bawaan')
assert(id.nama === 'PT Propfs Karya Utama', 'nama perusahaan dipakai')
assert(id.logo === 'data:image/png;base64,AAA', 'logo perusahaan dipakai')
assert(!id.kontak.includes('PropFS'), 'baris kontak tidak menyebut PropFS')
assert(id.kontak.includes('Jl. Merdeka No. 1, Bekasi') && id.kontak.includes('021-1234567'),
  'baris kontak menggabungkan alamat & telepon')

// Kontak hanya berisi kolom yang diisi
const sebagian = identitasLaporan({ ...PROFIL_KOSONG, nama: 'CV Maju', telepon: '0812' })
assert(sebagian.kontak === '0812', 'kolom kosong tidak ikut ke baris kontak')

// Logo boleh kosong walau nama sudah diisi
assert(identitasLaporan({ ...PROFIL_KOSONG, nama: 'CV Maju' }).logo === '', 'logo boleh kosong')

// ── Footer laporan: nama perusahaan, tanpa penanda apa pun ────────────────
const footer = footerLaporan(pt)
assert(footer.includes('PT Propfs Karya Utama'), 'footer memakai nama perusahaan')
assert(!/versi gratis/i.test(footer), 'tidak ada penanda "Versi Gratis" di footer')
assert(!footer.includes('propfs.id'), 'nama perusahaan terisi: propfs.id tidak ikut')

const footerBawaan = footerLaporan(PROFIL_KOSONG)
assert(footerBawaan.includes('propfs.id'), 'profil kosong memakai identitas PropFS')
assert(!/versi gratis/i.test(footerBawaan), 'pun begitu, tanpa penanda "Versi Gratis"')

// ── Kop: profil perusahaan → nama pemilik akun → PropFS ────────────────────
// Kontraktor perorangan tidak pernah membuka Pengaturan; tanpa cadangan ini
// dokumen yang dikirim ke vendor tidak menyebut satu pun nama pemesan.
const profilPT = { ...PROFIL_KOSONG, nama: 'PT Jaya Abadi', telepon: '021-555', logo: 'data:image/png;base64,x' }

const kopPT = identitasLaporan(profilPT, { nama: 'Jumani' })
assert(kopPT.nama === 'PT Jaya Abadi', 'profil perusahaan menang atas nama akun')
assert(kopPT.sumber === 'perusahaan', 'sumbernya ditandai perusahaan')
assert(kopPT.logo === 'data:image/png;base64,x', 'logo perusahaan ikut terbawa')
assert(kopPT.bawaan === false, 'bukan identitas bawaan')

const kopAkun = identitasLaporan(PROFIL_KOSONG, { nama: 'Jumani', telepon: '0812', email: 'j@x.id' })
assert(kopAkun.nama === 'Jumani', 'tanpa profil PT, nama pemilik akun yang dipakai')
assert(kopAkun.sumber === 'akun', 'sumbernya ditandai akun')
assert(kopAkun.bawaan === false, 'nama akun bukan identitas bawaan — kop tetap dicetak')
assert(kopAkun.kontak === '0812 · j@x.id', 'telepon & email akun jadi baris kontak')
assert(kopAkun.logo === '', 'akun perorangan tidak punya logo')

assert(identitasLaporan(PROFIL_KOSONG, { nama: 'Jumani', perusahaan: 'CV Mandiri' }).nama === 'CV Mandiri',
  'nama perusahaan pada akun dipakai lebih dulu daripada nama orang')
assert(identitasLaporan(PROFIL_KOSONG, { nama: '  Jumani  ' }).nama === 'Jumani', 'spasi dipangkas')
assert(identitasLaporan(PROFIL_KOSONG, { nama: '   ' }).sumber === 'bawaan',
  'nama akun yang hanya spasi tidak dianggap ada')

const kopBawaan = identitasLaporan(PROFIL_KOSONG, null)
assert(kopBawaan.nama === 'PropFS' && kopBawaan.bawaan === true, 'tanpa keduanya jatuh ke kop PropFS')
assert(identitasLaporan(PROFIL_KOSONG).sumber === 'bawaan', 'tanpa argumen cadangan tetap seperti semula')
assert(identitasLaporan(null).nama === 'PropFS', 'profil null aman')

// ── Watermark benar-benar tidak ada lagi ──────────────────────────────────
//
// Diperiksa dari MODULNYA, bukan dari perilakunya. Sebuah `perluWatermark`
// yang tinggal mengembalikan false akan lolos uji perilaku, lalu suatu hari
// "diperbaiki" kembali menjadi true dan watermark muncul lagi di seluruh
// dokumen sekaligus. Yang dijaga di sini adalah bahwa jalannya sudah tidak ada.
for (const nama of ['perluWatermark', 'TEKS_WATERMARK', 'TANPA_WATERMARK']) {
  assert(!(nama in branding), `${nama} sudah tidak diekspor branding.ts`)
}
assert(!('watermark' in kopLaporan(pt)), 'kopLaporan tidak lagi punya kolom watermark')
assert(!('watermark' in kopLaporan(PROFIL_KOSONG)), 'profil kosong pun tanpa kolom watermark')
assert(!/versi gratis/i.test(JSON.stringify(kopLaporan(pt))),
  'kop laporan Excel tidak lagi membawa watermark')

console.log(`✅ branding: ${ok} assertion lolos`)
