// Test penyelarasan konten landing dengan bawaan terbaru.
import {
  SEKSI_LANDING, samaIsinya, bandingkanSeksi, pakaiBawaanSeksi, pakaiBawaanSemua,
  ringkasBeda,
} from '../src/lib/kontenLanding.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── samaIsinya ─────────────────────────────────────────────────────────────
assert(samaIsinya(1, 1) && samaIsinya('a', 'a') && samaIsinya(null, null), 'nilai sederhana')
assert(!samaIsinya(1, '1'), 'tipe berbeda tidak sama')
assert(!samaIsinya(null, {}), 'null bukan objek kosong')
assert(!samaIsinya(undefined, ''), 'undefined bukan string kosong')

// Urutan kunci objek TIDAK dianggap perbedaan — data yang bolak-balik lewat
// JSON sering berganti urutan tanpa berubah isinya.
assert(samaIsinya({ a: 1, b: 2 }, { b: 2, a: 1 }), 'urutan kunci objek tidak berarti')
assert(!samaIsinya({ a: 1 }, { a: 1, b: 2 }), 'kunci tambahan berarti berbeda')
assert(!samaIsinya({ a: 1, b: 2 }, { a: 1 }), 'kunci hilang berarti berbeda')

// Urutan larik JUSTRU berarti — itu urutan tampil di halaman.
assert(samaIsinya([1, 2], [1, 2]), 'larik sama')
assert(!samaIsinya([1, 2], [2, 1]), 'urutan larik berarti')
assert(!samaIsinya([1], [1, 2]), 'panjang larik berarti')
assert(!samaIsinya([1], { 0: 1 }), 'larik bukan objek')

// Bersarang
assert(samaIsinya({ a: [{ b: 1 }] }, { a: [{ b: 1 }] }), 'objek bersarang sama')
assert(!samaIsinya({ a: [{ b: 1 }] }, { a: [{ b: 2 }] }), 'objek bersarang berbeda')

// ── bandingkanSeksi ────────────────────────────────────────────────────────
const BAWAAN = {
  branding: { siteName: 'PropFS', tagline: 'Kontraktor AI & Feasibility Study' },
  hero: { title: 'Kendalikan Proyek Konstruksi dari HP Anda', hashtags: ['#KontraktorAI'] },
  suitableFor: { label: 'UNTUK:', tags: ['Kontraktor Renovasi'] },
  features: [{ id: '1', title: 'Chat AI Lintas Modul' }],
  auxiliaryProducts: [{ id: 'a1', title: 'Feasibility Study' }],
  marketingHighlight: { title: 'Satu Masukan, Semua Modul Terisi' },
  footer: { email: 'hello@propfs.id' },
  faq: { title: 'FAQ', items: [] },
}

// Persis seperti keadaan pemakai: konten lama tersimpan di CMS, kode sudah maju.
const TERSIMPAN = {
  ...BAWAAN,
  branding: { siteName: 'PropFS', tagline: 'FEASIBILITY STUDY & AI CONTRACTOR' },
  hero: { title: 'Analisa Kelayakan Proyek Properti Lebih Cepat', hashtags: ['#DeveloperProperti'] },
  features: [{ id: '1', title: 'Feasibility Study' }],
  footer: { email: 'kontak@propfs.id' },   // sengaja diubah admin — jangan diganggu
}

{
  const beda = bandingkanSeksi(TERSIMPAN, BAWAAN)
  assert(beda.length === SEKSI_LANDING.length, 'setiap bagian dilaporkan')
  const berbeda = beda.filter(b => b.berbeda).map(b => b.kunci)
  assert(berbeda.join(',') === 'branding,hero,features,footer',
    `yang berbeda: branding, hero, features, footer (dapat ${berbeda.join(',')})`)

  const sama = beda.filter(b => !b.berbeda).map(b => b.kunci)
  assert(sama.includes('suitableFor') && sama.includes('faq'), 'yang sudah sama tidak ikut dilaporkan berbeda')
  assert(beda.every(b => b.label && b.isi), 'tiap bagian punya label & penjelasan untuk layar')
}

// Belum pernah disunting sama sekali → semuanya berbeda, bukan meledak.
assert(bandingkanSeksi(null, BAWAAN).every(b => b.berbeda), 'konten null: semua berbeda')
assert(bandingkanSeksi(undefined, BAWAAN).every(b => b.berbeda), 'konten undefined aman')
assert(bandingkanSeksi({}, BAWAAN).every(b => b.berbeda), 'konten kosong: semua berbeda')
assert(bandingkanSeksi(BAWAAN, BAWAAN).every(b => !b.berbeda), 'identik: tidak ada yang berbeda')

// ── pakaiBawaanSeksi: hanya bagian yang dipilih ───────────────────────────
{
  const hasil = pakaiBawaanSeksi(TERSIMPAN, BAWAAN, 'hero')
  assert(hasil.hero.title === BAWAAN.hero.title, 'hero diambil dari bawaan')
  // Inilah gunanya per bagian: alamat kontak yang sengaja diubah admin TIDAK
  // ikut terhapus hanya karena naskah modulnya diperbarui.
  assert(hasil.footer.email === 'kontak@propfs.id', 'footer yang sudah disunting TIDAK ikut berubah')
  assert(hasil.features[0].title === 'Feasibility Study', 'bagian lain tidak tersentuh')
  assert(TERSIMPAN.hero.title === 'Analisa Kelayakan Proyek Properti Lebih Cepat',
    'masukan aslinya tidak diubah')
}

// Hasilnya salinan DALAM: menyuntingnya tidak boleh merusak bawaan yang
// dipakai bersama seluruh aplikasi.
{
  const hasil = pakaiBawaanSeksi(TERSIMPAN, BAWAAN, 'features')
  hasil.features[0].title = 'Diubah setelah disalin'
  assert(BAWAAN.features[0].title === 'Chat AI Lintas Modul',
    'DEFAULT_LANDING_CONTENT tidak ikut berubah — salinannya dalam, bukan dangkal')

  const h2 = pakaiBawaanSeksi(TERSIMPAN, BAWAAN, 'hero')
  h2.hero.hashtags.push('#Tambahan')
  assert(BAWAAN.hero.hashtags.length === 1, 'larik bersarang juga disalin')
}

// Kunci yang tidak dikenal diabaikan, bukan menyisipkan bagian siluman.
{
  const hasil = pakaiBawaanSeksi(TERSIMPAN, BAWAAN, 'entah')
  assert(hasil === TERSIMPAN, 'kunci asing dikembalikan apa adanya')
}

// ── pakaiBawaanSemua ──────────────────────────────────────────────────────
{
  const hasil = pakaiBawaanSemua(TERSIMPAN, BAWAAN)
  assert(bandingkanSeksi(hasil, BAWAAN).every(b => !b.berbeda), 'setelah semua diambil, tidak ada yang berbeda')
  assert(hasil.footer.email === 'hello@propfs.id', 'footer ikut kembali ke bawaan bila dipilih semua')
  assert(TERSIMPAN.footer.email === 'kontak@propfs.id', 'masukan aslinya tetap utuh')
}

// ── ringkasBeda ───────────────────────────────────────────────────────────
assert(/4 bagian berbeda/.test(ringkasBeda(bandingkanSeksi(TERSIMPAN, BAWAAN))),
  `ringkasan menyebut jumlahnya: ${ringkasBeda(bandingkanSeksi(TERSIMPAN, BAWAAN))}`)
assert(ringkasBeda(bandingkanSeksi(BAWAAN, BAWAAN)) === 'Semua bagian sudah sama dengan bawaan terbaru.',
  'tidak ada beda berbunyi wajar')

// ── Daftar bagian ─────────────────────────────────────────────────────────
assert(SEKSI_LANDING.length === 8, 'delapan bagian')
assert(SEKSI_LANDING[0].kunci === 'branding' && SEKSI_LANDING[1].kunci === 'hero',
  'urutannya mengikuti urutan di halaman, bukan abjad')
assert(new Set(SEKSI_LANDING.map(s => s.kunci)).size === 8, 'tidak ada kunci kembar')

console.log(`konten-landing: ${ok} assert lulus`)
