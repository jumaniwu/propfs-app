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

console.log(`✅ branding: ${ok} assertion lolos`)
