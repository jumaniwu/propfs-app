// Test penyiapan materi promosi media sosial (Marcom).
import {
  FORMAT_MARCOM, URUTAN_FORMAT, TEMPLATE_MARCOM, URUTAN_TEMPLATE, tataLetak, garisProyek,
  nomorTampil, barisKontak, namaTampil, periksaProfil,
  susunCaption, bersihkanHashtag, bungkusBaris, judulGambar, namaBerkas,
  durasiVideo, fotoPadaWaktu, DURASI_PER_FOTO, CTA_BAWAAN,
} from '../src/lib/marcom.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const PROFIL = {
  nama: 'PT Karya Bangun Sejahtera', logo: 'data:image/png;base64,xx',
  alamat: 'Batam', telepon: '081234567890', email: 'halo@kbs.co.id', website: 'https://kbs.co.id/',
}

// ── Format ───────────────────────────────────────────────────────────────
assert(FORMAT_MARCOM.feed.lebar === FORMAT_MARCOM.feed.tinggi, 'Feed benar-benar 1:1')
assert(FORMAT_MARCOM.story.tinggi / FORMAT_MARCOM.story.lebar === 16 / 9, 'Story benar-benar 9:16')
assert(FORMAT_MARCOM.lanskap.lebar / FORMAT_MARCOM.lanskap.tinggi === 16 / 9, 'Lanskap benar-benar 16:9')
assert(URUTAN_FORMAT.length === Object.keys(FORMAT_MARCOM).length, 'semua format punya urutan')
assert(URUTAN_FORMAT.every(f => FORMAT_MARCOM[f]), 'urutan tidak menyebut format yang tidak ada')
assert(Object.values(FORMAT_MARCOM).every(f => Math.min(f.lebar, f.tinggi) === 1080),
  'sisi pendek 1080 px — ukuran yang benar-benar dipakai platform')

// ── Tata letak ───────────────────────────────────────────────────────────
assert(URUTAN_TEMPLATE.length === Object.keys(TEMPLATE_MARCOM).length, 'semua template punya urutan')
assert(URUTAN_TEMPLATE[0] === 'sorot', 'template bawaan menonjolkan fotonya')

for (const tm of URUTAN_TEMPLATE) {
  for (const f of URUTAN_FORMAT) {
    const t = tataLetak(f, tm)
    assert(t.template === tm, `${tm}/${f}: templatenya ikut terbawa`)
    assert(t.lebar === FORMAT_MARCOM[f].lebar && t.tinggi === FORMAT_MARCOM[f].tinggi,
      `${tm}/${f}: ukurannya ikut formatnya`)
    assert(t.tepi > 0 && t.tepi < t.lebar / 4, `${tm}/${f}: jarak tepi masuk akal`)
    assert(t.kontak.y <= t.tinggi, `${tm}/${f}: kontak tidak jatuh ke luar gambar`)
    assert(t.kontak.y > t.tinggi * 0.6, `${tm}/${f}: kontak memang di bagian bawah`)
    assert(t.logo.maks > 0 && t.logo.maks < t.lebar / 2, `${tm}/${f}: logo tidak menutupi fotonya`)
    assert(t.tinggiFooter > 0 && t.tinggiFooter < t.tinggi * 0.55,
      `${tm}/${f}: area gelap tidak menelan setengah gambar`)

    // Story: sepertiga bawah tertutup kolom balasan & tombol platform.
    if (f === 'story') {
      assert(t.tinggi - t.kontak.y > t.tinggi * 0.08,
        `${tm}: kontak Story dinaikkan jauh dari tepi bawah`)
    }
  }
}

// Bawaan tanpa argumen kedua = template yang dipakai sehari-hari.
assert(tataLetak('feed').template === 'sorot', 'tanpa disebut, template sorot yang dipakai')

// ── Template 'sorot': fotonya yang menonjol ──────────────────────────────
for (const f of URUTAN_FORMAT) {
  const s = tataLetak(f, 'sorot')
  const k = tataLetak(f, 'klasik')
  assert(s.tinggiFooter < k.tinggiFooter,
    `${f}: pita 'sorot' jauh lebih tipis daripada footer 'klasik'`)
  assert(s.tinggiFooter < s.tinggi * 0.22, `${f}: pita bawah menutupi kurang dari seperlima gambar`)
  assert(s.logo.tengah === true, `${f}: logo 'sorot' dipusatkan`)
  assert(s.logo.x === Math.round(s.lebar / 2), `${f}: titik pusat logo benar-benar di tengah`)
  assert(s.logo.maks > k.logo.maks, `${f}: logo 'sorot' lebih besar karena berdiri sendiri`)
  assert(s.tagline.y > s.logo.y + s.logo.maks, `${f}: semboyan berada di BAWAH logo`)
  assert(s.garisProyek.y > s.tinggi - s.tinggiFooter, `${f}: baris proyek berada di dalam pita`)
  assert(s.garisProyek.y < s.kontak.y, `${f}: baris proyek di atas baris kontak`)
  assert(s.kontak.y <= s.tinggi - (f === 'story' ? s.tinggi * 0.09 : s.tepi * 0.5),
    `${f}: kontak tidak menempel tepi bawah`)
}

// ── Template 'klasik': judul besar, tumpukan dari bawah ──────────────────
for (const f of URUTAN_FORMAT) {
  const t = tataLetak(f, 'klasik')
  assert(t.logo.tengah === false, `${f}: logo 'klasik' di kiri atas`)
  assert(t.kontak.y > t.judul.yBawah, `${f}: kontak di bawah judul`)
  assert(t.judul.lebarMaks < t.lebar, `${f}: teks tidak selebar penuh, ada napas di tepi`)
  assert(t.judul.tinggiBaris > t.judul.ukuran, `${f}: baris judul tidak berdempetan`)

  // Judul dua baris + kontak dua baris adalah keadaan terpadat.
  const atasKontakDuaBaris = t.kontak.y - t.kontak.tinggiBaris - t.kontak.ukuran
  assert(t.judul.yBawah <= atasKontakDuaBaris,
    `${f}: judul berakhir di atas blok kontak dua baris (${t.judul.yBawah} vs ${atasKontakDuaBaris})`)

  const atasJudulDuaBaris = t.judul.yBawah - t.judul.tinggiBaris - t.judul.ukuran
  assert(t.keterangan.y <= atasJudulDuaBaris,
    `${f}: keterangan berada DI ATAS judul, tidak menimpanya (${t.keterangan.y} vs ${atasJudulDuaBaris})`)
  assert(t.keterangan.y - t.keterangan.ukuran > t.tinggi - t.tinggiFooter * 1.6,
    `${f}: seluruh teks jatuh di dalam pita gelap, tidak melayang di atas foto terang`)
}

// ── Baris proyek di pita bawah ───────────────────────────────────────────
assert(garisProyek('Boutique Hotel at Nagoya', 'Civil, Architecture and MEP works')
  === 'Project: Boutique Hotel at Nagoya | Civil, Architecture and MEP works',
  'bentuknya mengikuti yang lazim dipakai kontraktor di Instagram')
assert(garisProyek('Ruko Pak Soni') === 'Project: Ruko Pak Soni',
  'tanpa lingkup, pemisah tidak ikut tercetak menggantung')
assert(garisProyek('', 'Renovasi total') === 'Renovasi total',
  'tanpa nama proyek, lingkupnya berdiri sendiri tanpa kata "Project:"')
assert(garisProyek('', '') === '', 'tanpa keduanya tidak mengarang baris')
assert(garisProyek(null, null) === '', 'null aman')
assert(garisProyek('  Ruko  ', '  ') === 'Project: Ruko', 'spasi di tepi dipangkas')

// ── Nomor kontak ─────────────────────────────────────────────────────────
assert(nomorTampil('081234567890') === '+62 812-3456-7890', `08… jadi +62: ${nomorTampil('081234567890')}`)
assert(nomorTampil('+62 812-3456-7890') === '+62 812-3456-7890', 'yang sudah rapi tidak berubah')
assert(nomorTampil('  ') === '', 'kosong tetap kosong')
assert(nomorTampil(null) === '', 'null aman')
assert(nomorTampil('0812 3456 7890') === '+62 812-3456-7890', 'spasi & tanda kurung dirapikan')
// Nomor kantor: dinormalkan juga, dan ujungnya TIDAK dipecah jadi potongan
// dua angka yang terbaca seperti salah ketik.
assert(nomorTampil('(0778) 123456') === '+62 778-123456',
  `nomor kantor dirapikan tanpa ekor pendek: ${nomorTampil('(0778) 123456')}`)
// Yang benar-benar tidak bisa ditafsirkan dikembalikan APA ADANYA — dibuang
// berarti menghapus satu-satunya cara menghubungi.
assert(nomorTampil('+1 555 0100') === '+1 555 0100', 'nomor luar negeri tidak dipaksa jadi +62')
assert(nomorTampil('abc') === 'abc', 'teks bukan nomor tidak dihapus diam-diam')

// ── Baris kontak untuk footer ────────────────────────────────────────────
{
  const b = barisKontak(PROFIL)
  assert(b[0] === '+62 812-3456-7890', 'nomor telepon selalu paling depan')
  assert(b[1] === 'kbs.co.id', `alamat web dibersihkan dari https:// dan garis miring: ${b[1]}`)
  assert(b.length <= 2, 'footer tidak berubah jadi kartu nama')
}
assert(barisKontak({ telepon: '081234567890', email: 'a@b.com' })[1] === 'a@b.com',
  'tanpa website, email yang dipakai')
assert(barisKontak({}).length === 0, 'profil kosong tidak mengarang baris')
assert(barisKontak({ telepon: '081234567890', website: 'x.id', email: 'a@b.com' }, 1).length === 1,
  'batas baris dihormati')

// ── Kesiapan profil ──────────────────────────────────────────────────────
assert(periksaProfil(PROFIL).siap === true, 'profil lengkap siap dipakai')
assert(periksaProfil({}).siap === false, 'profil kosong belum siap')
assert(periksaProfil({}).kurang.includes('Nomor telepon'), 'disebut apa yang kurang, bukan sekadar ditolak')
assert(periksaProfil({ nama: 'PT A', telepon: '081234567890' }).siap === true,
  'tanpa logo pun masih bisa jalan — namanya tetap bisa dicetak sebagai teks')
assert(periksaProfil({ nama: 'PT A', telepon: '081234567890' }).kurang.includes('Logo'),
  'tapi ketiadaan logo tetap diberitahukan')

// ── Caption ──────────────────────────────────────────────────────────────
{
  const c = susunCaption({
    teks: 'Progres pengecoran lantai 2 Ruko De Monde Bay minggu ini.',
    hashtag: 'renovasi, kontraktor batam',
    profil: PROFIL,
  })
  assert(c.includes('Progres pengecoran'), 'kalimat utamanya ada')
  assert(c.includes('+62 812-3456-7890'), 'nomor kontak IKUT — inilah inti permintaannya')
  assert(c.includes(CTA_BAWAAN), 'ada ajakan bertindak')
  assert(c.includes('PT Karya Bangun Sejahtera'), 'nama perusahaan ikut')
  assert(c.includes('#renovasi') && c.includes('#kontraktor'), 'hashtag ikut')

  // Kontak HARUS di atas hashtag: caption panjang dipotong "selengkapnya",
  // dan yang terpotong tidak boleh nomor teleponnya.
  assert(c.indexOf('+62 812-3456-7890') < c.indexOf('#renovasi'),
    'nomor kontak berada di atas hashtag, bukan di paling bawah')
}
assert(susunCaption({ teks: 'Halo', profil: PROFIL }).trim().endsWith('PT Karya Bangun Sejahtera'),
  'tanpa hashtag, caption ditutup identitas & kontak')
assert(susunCaption({}) === '', 'tanpa apa pun tidak mengarang caption')
assert(!susunCaption({ teks: 'Halo', profil: { nama: 'PT A' } }).includes('📞'),
  'tanpa nomor telepon, blok kontak tidak dipaksakan')
{
  const c = susunCaption({ teks: 'Halo', cta: 'Hubungi kami sekarang:', profil: PROFIL })
  assert(c.includes('Hubungi kami sekarang:') && !c.includes(CTA_BAWAAN), 'ajakan bisa diganti sendiri')
}

// ── Hashtag ──────────────────────────────────────────────────────────────
assert(bersihkanHashtag('#Renovasi #renovasi').length === 1,
  'kembar beda huruf besar-kecil dianggap satu — Instagram pun begitu')
assert(bersihkanHashtag('renovasi kontraktor')[0] === '#renovasi', 'tanda pagar ditambahkan sendiri')
assert(bersihkanHashtag('##ganda')[0] === '#ganda', 'pagar berlebih dirapikan')
assert(bersihkanHashtag('kontraktor batam!')[1] === '#batam', 'tanda baca dibuang dari dalam tagar')
assert(bersihkanHashtag(['a', 'b', 'a']).length === 2, 'menerima larik, kembar tetap dibuang')
assert(bersihkanHashtag('').length === 0, 'kosong aman')
assert(bersihkanHashtag(null).length === 0, 'null aman')
assert(bersihkanHashtag('a b c d e', 3).length === 3, 'batas jumlah dihormati')
assert(bersihkanHashtag('#!!!').length === 0, 'tagar yang isinya hanya tanda baca dibuang')

// ── Membungkus baris teks ────────────────────────────────────────────────
{
  // Pengukurannya disuntikkan; di sini "muat" = maksimal 20 karakter.
  const muat = s => s.length <= 20
  const b = bungkusBaris('Progres pengecoran lantai dua minggu ini', muat)
  assert(b.length > 1, 'teks panjang dipecah jadi beberapa baris')
  assert(b.every(x => x.length <= 20), `tiap baris muat: ${JSON.stringify(b)}`)
  assert(b.join(' ') === 'Progres pengecoran lantai dua minggu ini', 'tidak ada kata yang hilang')
}
{
  // Kata yang lebih panjang dari satu baris: diberi barisnya sendiri, TIDAK
  // dipotong di tengah — kata terpotong lebih buruk daripada baris kelebaran.
  const b = bungkusBaris('Halo Pembangunanberkelanjutanindonesia ya', s => s.length <= 10)
  assert(b.some(x => x.includes('Pembangunanberkelanjutanindonesia')),
    `kata panjang tetap utuh: ${JSON.stringify(b)}`)
}
{
  const b = bungkusBaris('satu dua tiga empat lima enam tujuh delapan', s => s.length <= 8, 2)
  assert(b.length === 2, 'batas jumlah baris dihormati')
  assert(b[1].endsWith('…'), 'sisa yang tidak muat diberi tanda, bukan dibuang diam-diam')
}
assert(bungkusBaris('', () => true).length === 0, 'teks kosong tidak menghasilkan baris')
assert(bungkusBaris(null, () => true).length === 0, 'null aman')
assert(bungkusBaris('   ', () => true).length === 0, 'spasi saja tidak menghasilkan baris')

// ── Judul gambar ─────────────────────────────────────────────────────────
assert(judulGambar('Ruko De Monde Bay') === 'Ruko De Monde Bay', 'judul pendek utuh')
assert(judulGambar('x'.repeat(80)).length === 60, 'judul panjang dipangkas ke batas')
assert(judulGambar('x'.repeat(80)).endsWith('…'), 'pemangkasan diberi tanda')
assert(judulGambar('  banyak   spasi  ') === 'banyak spasi', 'spasi berlebih dirapikan')
assert(judulGambar(null) === '', 'null aman')

// ── Nama berkas ──────────────────────────────────────────────────────────
{
  const n = namaBerkas('Ruko Pak Soni', 'story', 'png', new Date(2026, 7, 2))
  assert(n === 'ruko-pak-soni-story-20260802.png', `nama berkasnya rapi: ${n}`)
}
assert(namaBerkas('A/B:C*', 'feed', 'jpg', new Date(2026, 0, 1)) === 'a-b-c-feed-20260101.jpg',
  'karakter yang dilarang sistem berkas dibuang')
assert(namaBerkas('', 'feed', 'png', new Date(2026, 0, 1)).startsWith('promosi-'),
  'tanpa nama tetap dapat nama yang wajar')
assert(namaBerkas('x', 'feed', '.webm', new Date(2026, 0, 1)).endsWith('.webm'), 'titik ganda tidak terjadi')
assert(!namaBerkas('x', 'feed', 'png', new Date('ngawur')).includes('NaN'), 'tanggal rusak tidak bocor ke nama')

// ── Video slideshow ──────────────────────────────────────────────────────
assert(durasiVideo(4) === 4 * DURASI_PER_FOTO, 'durasi = jumlah foto × lama per foto')
assert(durasiVideo(0) === 0, 'tanpa foto tidak ada video')
assert(durasiVideo(-3) === 0, 'jumlah negatif tidak menghasilkan durasi negatif')
assert(durasiVideo(3, 1000) === 3000, 'lama per foto bisa diatur')
{
  const a = fotoPadaWaktu(0, 3)
  assert(a.indeks === 0, 'awal video menampilkan foto pertama')
  const b = fotoPadaWaktu(DURASI_PER_FOTO + 10, 3)
  assert(b.indeks === 1, 'lewat batas berpindah ke foto berikutnya')
  const c = fotoPadaWaktu(999999, 3)
  assert(c.indeks === 2, 'melewati akhir tetap berhenti di foto terakhir, tidak keluar batas')
}
{
  const awal = fotoPadaWaktu(0, 2)
  const nanti = fotoPadaWaktu(400, 2)
  assert(awal.pudar < 1, 'foto baru masuk dengan transisi, tidak menyentak')
  assert(nanti.pudar === 1, 'setelah transisi selesai, tampil penuh')
}
assert(fotoPadaWaktu(0, 0).indeks === 0, 'tanpa foto tidak meledak')
assert(fotoPadaWaktu(-5, 3).indeks === 0, 'waktu negatif tidak menghasilkan indeks negatif')

console.log(`marcom: ${ok} assert lulus`)
