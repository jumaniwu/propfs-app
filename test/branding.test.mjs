// Test branding laporan: identitas perusahaan menggantikan PropFS,
// dan watermark hanya muncul pada paket gratis.
import {
  identitasLaporan, footerLaporan, perluWatermark, TEKS_WATERMARK, PROFIL_KOSONG,
} from '../src/lib/branding.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Watermark: HANYA paket gratis ──────────────────────────────────────────
assert(perluWatermark('free'), 'paket free diberi watermark')
assert(perluWatermark(''), 'tanpa paket dianggap gratis')
assert(perluWatermark(null), 'plan null dianggap gratis')
assert(perluWatermark(undefined), 'plan undefined dianggap gratis')
assert(perluWatermark('FREE'), 'huruf besar tetap dikenali gratis')
assert(perluWatermark(' free '), 'spasi berlebih tetap dikenali gratis')
assert(perluWatermark('trial'), 'paket trial diberi watermark')

assert(!perluWatermark('fs'), 'katalog Feasibility Study tanpa watermark')
assert(!perluWatermark('kontraktor'), 'katalog Kontraktor AI tanpa watermark')
assert(!perluWatermark('bundle'), 'katalog gabungan tanpa watermark')
assert(!perluWatermark('pro'), 'paket lama pro tanpa watermark')
assert(!perluWatermark('starter'), 'paket lama starter tanpa watermark')

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

// ── Footer laporan ─────────────────────────────────────────────────────────
const footerBayar = footerLaporan(pt, 'kontraktor')
assert(footerBayar.includes('PT Propfs Karya Utama'), 'footer memakai nama perusahaan')
assert(!footerBayar.includes(TEKS_WATERMARK), 'paket berbayar tanpa watermark di footer')
assert(!footerBayar.includes('propfs.id'), 'paket berbayar tidak menampilkan propfs.id')

const footerGratis = footerLaporan(pt, 'free')
assert(footerGratis.includes(TEKS_WATERMARK), 'paket gratis diberi penanda watermark')
assert(footerGratis.includes('PT Propfs Karya Utama'), 'nama perusahaan tetap tampil di paket gratis')

const footerBawaanGratis = footerLaporan(PROFIL_KOSONG, 'free')
assert(footerBawaanGratis.includes('propfs.id'), 'profil kosong + gratis memakai identitas PropFS')
assert(footerBawaanGratis.includes(TEKS_WATERMARK), 'profil kosong + gratis tetap diberi watermark')

const footerBawaanBayar = footerLaporan(PROFIL_KOSONG, 'bundle')
assert(!footerBawaanBayar.includes(TEKS_WATERMARK),
  'berbayar tanpa profil: tetap tanpa watermark walau identitas masih PropFS')

// ── Watermark: paket saja TIDAK cukup ──────────────────────────────────────
// getPlanFor() mengembalikan 'free' pada dua keadaan yang bukan pelanggan
// gratis: pemilik hak lewat peran, dan saat sistem langganan dimatikan.

// Superadmin — dokumennya milik pengelola sistem, bukan pelanggan.
assert(!perluWatermark({ planId: 'free', role: 'superadmin' }),
  'superadmin tidak pernah diberi watermark walau paketnya terbaca free')
assert(!perluWatermark({ planId: '', role: 'SuperAdmin' }),
  'peran tidak peka huruf besar-kecil')
assert(!perluWatermark({ planId: 'free', role: '  superadmin  ' }),
  'spasi di tepi peran diabaikan')
assert(perluWatermark({ planId: 'free', role: 'user' }),
  'pengguna biasa berpaket gratis tetap diberi watermark')
assert(perluWatermark({ planId: 'free', role: 'admin' }),
  'admin biasa (bukan superadmin) tetap mengikuti paketnya')

// Akses yang diberikan langsung ke satu pengguna.
assert(!perluWatermark({ planId: 'free', customFeatures: { cost_control: true } }),
  'custom_features yang memberi akses membuat dokumen bersih')
assert(perluWatermark({ planId: 'free', customFeatures: { cost_control: false } }),
  'custom_features bernilai false tidak memberi apa-apa')
assert(perluWatermark({ planId: 'free', customFeatures: { fitur_lain: true } }),
  'fitur lain tidak ikut membebaskan watermark')
assert(!perluWatermark({ planId: 'free', customFeatures: { laporan: true }, fitur: 'laporan' }),
  'nama fitur bisa ditentukan pemanggil')
assert(perluWatermark({ planId: 'free', customFeatures: null }), 'customFeatures null aman')

// Sistem langganan dimatikan: getPlanFor() memberi 'free' ke SEMUA orang.
assert(!perluWatermark({ planId: 'free', sistemLanggananAktif: false }),
  'sistem langganan mati: tidak ada paket berbayar, jadi jangan ditandai gratis')
assert(perluWatermark({ planId: 'free', sistemLanggananAktif: true }),
  'sistem langganan hidup: paket gratis tetap diberi watermark')
assert(perluWatermark({ planId: 'free' }),
  'tanpa keterangan sistem langganan, perilakunya seperti semula')

// Bentuk lama (teks) harus tetap berlaku.
assert(perluWatermark('free') && !perluWatermark('pro'), 'argumen teks tetap didukung')
assert(perluWatermark(null) && perluWatermark(undefined), 'null/undefined dianggap gratis')
assert(!perluWatermark({ planId: 'pro', role: 'user' }), 'paket berbayar tetap bersih')

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

console.log(`✅ branding: ${ok} assertion lolos`)
