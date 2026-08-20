// ============================================================
// Urutan lapisan.
//
// Satu kenyataan menentukan seluruh berkas ini: BottomNav berdiri di z-50,
// `fixed bottom-0`, dan dirender SETELAH <Routes> di App.tsx. Dua elemen
// dengan z-index sama diadu menurut urutan kemunculannya di dokumen, dan yang
// belakangan menang — jadi setiap tirai layar penuh yang juga memakai z-50
// KALAH, tetapi hanya 64 piksel paling bawahnya. Persis tempat tombol aksi
// diletakkan.
//
// Akibatnya tidak pernah terlihat seperti cacat lapisan. Yang dilaporkan
// pemakainya adalah "tombol bawah terlalu di bawah".
//
// Uji terakhir di berkas ini MEMBACA SUMBER APLIKASINYA. Itu disengaja: aturan
// yang hanya ditulis di komentar akan dilanggar oleh tirai berikutnya yang
// ditambahkan enam bulan lagi, dan pelanggarannya tidak terlihat sampai ada
// yang memakainya di HP.
// ============================================================
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  Z_NAV_BAWAH, Z_TIRAI, Z_DI_ATAS_TIRAI, Z_PESAN,
  PADDING_BAWAH_TIRAI, tertutupNav,
} from '../src/lib/lapisan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Urutannya menaik, dan tirai HARUS di atas navigasi ────────────────
assert(Z_TIRAI > Z_NAV_BAWAH, 'tirai di atas navigasi bawah')
assert(Z_DI_ATAS_TIRAI > Z_TIRAI, 'yang di atas tirai memang lebih tinggi')
assert(Z_PESAN > Z_DI_ATAS_TIRAI, 'pesan/toast di atas segalanya — ia harus terbaca')
assert(Z_NAV_BAWAH === 50, 'nilai navigasi bawah adalah acuan, bukan pilihan')

// ── 2. Sama-nilai DIANGGAP tertutup — inilah inti pemeriksaannya ────────
//
// Pada nilai yang sama, yang menang adalah yang dirender belakangan, dan
// BottomNav selalu belakangan karena ia berada di bawah <Routes>.
assert(tertutupNav(50) === true, 'z-50 tertutup — bukan "seri", melainkan KALAH')
assert(tertutupNav(49) === true, 'di bawahnya jelas tertutup')
assert(tertutupNav(40) === true, 'z-40 juga')
assert(tertutupNav(60) === false, 'z-60 aman')
assert(tertutupNav('60') === false, 'teks angka tetap dibaca')
assert(tertutupNav(undefined) === true, 'tanpa nilai: anggap tertutup, jangan berandai aman')
assert(tertutupNav('ngawur') === true, 'yang tidak masuk akal dianggap tertutup')
assert(tertutupNav(NaN) === true, 'NaN dianggap tertutup')

// ── 3. Ruang bawah untuk bilah gestur ───────────────────────────────────
//
// Bukan untuk menghindari navigasi — tirai memang menutupinya. Ini untuk
// sapuan "kembali ke beranda" di dasar layar HP modern: tombol yang menempel
// persis di tepi berbagi tempat dengannya, dan yang terjadi bukan tombolnya
// tertekan melainkan aplikasinya tertutup.
assert(/safe-area-inset-bottom/.test(PADDING_BAWAH_TIRAI), 'menghitung bilah gestur')
assert(/max\(/.test(PADDING_BAWAH_TIRAI),
  'memakai max(): HP tanpa bilah gestur melaporkan 0, dan tombol yang menempel'
  + ' persis di tepi tetap tidak nyaman ditekan')
assert(PADDING_BAWAH_TIRAI.startsWith('pb-'), 'berupa kelas padding-bottom Tailwind')

// ── 4. TIDAK ADA tirai layar penuh yang tertinggal di z-50 ─────────────
//
// Uji ini membaca sumber aplikasinya. Aturan yang hanya ditulis di komentar
// akan dilanggar oleh tirai berikutnya, dan pelanggarannya tidak terlihat
// sampai ada yang memakainya di HP — lalu melaporkannya sebagai "tombolnya
// terpotong", yang tidak terdengar seperti masalah z-index sama sekali.
{
  const akar = new URL('../src', import.meta.url).pathname
  const berkas = []
  const telusuri = (d) => {
    for (const nama of readdirSync(d)) {
      const jalur = join(d, nama)
      if (statSync(jalur).isDirectory()) telusuri(jalur)
      else if (/\.tsx?$/.test(nama)) berkas.push(jalur)
    }
  }
  telusuri(akar)
  assert(berkas.length > 50, `sumbernya terbaca (${berkas.length} berkas)`)

  // `fixed inset-0` yang memakai z-50 atau lebih rendah.
  const pelanggar = []
  for (const jalur of berkas) {
    const isi = readFileSync(jalur, 'utf8')
    for (const baris of isi.split('\n')) {
      if (!/fixed\s+inset-0/.test(baris)) continue
      const m = /\bz-(?:\[(\d+)\]|(\d+))/.exec(baris)
      if (!m) continue
      const z = Number(m[1] ?? m[2])
      if (tertutupNav(z)) pelanggar.push(`${jalur.replace(akar, 'src')} → z-${z}`)
    }
  }
  assert(pelanggar.length === 0,
    `tirai layar penuh yang akan tertutup navigasi bawah:\n  ${pelanggar.join('\n  ')}`)

  // Navigasi bawahnya sendiri memang harus tetap z-50 — kalau ia ikut naik,
  // seluruh perhitungan di berkas ini kehilangan acuannya.
  const nav = readFileSync(join(akar, 'components/layout/BottomNav.tsx'), 'utf8')
  assert(/fixed bottom-0 inset-x-0 z-50/.test(nav),
    'BottomNav tetap di z-50 — ia acuan seluruh perhitungan ini')
}

console.log(`lapisan: ${ok} assert lulus`)
