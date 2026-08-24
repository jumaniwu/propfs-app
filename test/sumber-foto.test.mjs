// ============================================================
// Foto boleh datang dari kamera ATAU dari album.
//
// Sebuah `<input type="file" accept="image/*">` yang diberi atribut `capture`
// tidak sekadar mendahulukan kamera. Pada Android ia MENGHILANGKAN pilihan
// galeri sama sekali.
//
// Akibatnya bukan soal selera: pengawas memotret pekerjaan sambil berjalan,
// lalu mengisi laporan sore hari di kantor. Foto-fotonya sudah ada di album,
// dan satu-satunya cara memasukkannya adalah memotret ulang layar HP-nya
// sendiri. Tombolnya bahkan bertuliskan "Ambil / Pilih Foto" — menjanjikan
// sesuatu yang atributnya sendiri melarang.
//
// Uji terakhir di berkas ini membaca sumber aplikasinya, karena aturan yang
// hanya ditulis di komentar akan dilanggar oleh input berikutnya.
// ============================================================
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  atributInput, labelSumber, petunjukFoto, sisaMuat,
} from '../src/lib/sumberFoto.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Galeri TIDAK BOLEH punya `capture` sama sekali ────────────────────
//
// Bukan "capture kosong", bukan "capture: undefined yang ikut dirender".
// Nilai apa pun di sana sudah cukup membuat sebagian peramban membuka kamera,
// dan kesalahannya tidak terlihat sampai ada yang mencoba memilih foto lama.
{
  const galeri = atributInput('galeri')
  assert(!('capture' in galeri), 'atribut capture benar-benar TIDAK ADA, bukan sekadar kosong')
  assert(galeri.accept === 'image/*', 'tetap menyaring gambar')
  assert(galeri.multiple === false, 'bawaannya satu berkas')
  assert(atributInput('galeri', { banyak: true }).multiple === true, 'bisa banyak bila diminta')

  // Arah kamera tidak berlaku untuk galeri, dan tidak boleh menyelipkan capture.
  assert(!('capture' in atributInput('galeri', { arah: 'depan' })),
    'arah kamera pada galeri tidak menghidupkan capture')
}

// ── 2. Kamera memang membuka kamera, dan arahnya benar ──────────────────
{
  assert(atributInput('kamera').capture === 'environment', 'bawaannya kamera belakang')
  assert(atributInput('kamera', { arah: 'belakang' }).capture === 'environment', 'objek: belakang')
  assert(atributInput('kamera', { arah: 'depan' }).capture === 'user', 'orang: depan')
  assert(atributInput('kamera', { banyak: true }).multiple === true, 'boleh banyak sekaligus')
}

// ── 3. Label pendek — keduanya berdampingan di layar 390 piksel ─────────
assert(labelSumber('kamera') === 'Kamera', 'label kamera')
assert(labelSumber('galeri') === 'Galeri', 'label galeri')
assert(labelSumber('kamera').length <= 8 && labelSumber('galeri').length <= 8,
  'keduanya pendek; dua tombol harus muat berdampingan')

// ── 4. Sisa muat: dipotong SEBELUM dikecilkan ──────────────────────────
//
// Mengecilkan dua puluh foto lalu membuang lima belas di antaranya adalah
// belasan detik yang dihabiskan pemakai untuk menunggu pekerjaan yang memang
// akan dibuang.
assert(sisaMuat(6, 0) === 6, 'kosong: seluruh jatah')
assert(sisaMuat(6, 4) === 2, 'sudah terisi sebagian')
assert(sisaMuat(6, 6) === 0, 'penuh')
assert(sisaMuat(6, 9) === 0, 'melebihi jatah tidak menghasilkan angka negatif')
assert(sisaMuat('x', 'y') === 0, 'masukan tak masuk akal aman')
assert(sisaMuat(null, undefined) === 0, 'kosong aman')

// ── 5. Petunjuk menyebut BATASNYA, bukan cuma mengajak ────────────────
//
// Pengawas yang memotret dua puluh foto lalu menemukan hanya lima yang masuk
// akan menyangka aplikasinya memakan sisanya.
{
  const ada = petunjukFoto(6, 2)
  assert(/kamera atau album/i.test(ada), 'menyebut kedua sumbernya')
  assert(/Sisa 4/.test(ada), 'menyebut sisa jatahnya')

  const penuh = petunjukFoto(6, 6)
  assert(/hapus salah satu/i.test(penuh), 'saat penuh: memberi jalan keluar')
  assert(!/Sisa 0/.test(penuh), 'bukan "sisa 0", yang terdengar seperti kerusakan')
}

// ── 6. TIDAK ADA input foto yang hanya menyediakan kamera ──────────────
//
// Uji ini membaca sumber aplikasinya. Setiap berkas yang memuat `capture`
// harus juga memuat jalan menuju galeri — kalau tidak, ia mengulang persis
// keluhan yang berkas ini ada untuk mencegahnya.
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

  const pelanggar = []
  for (const jalur of berkas) {
    const isi = readFileSync(jalur, 'utf8')
    if (!/\bcapture[=:]/.test(isi)) continue
    // Berkas yang memakai capture harus punya jalur galeri: entah memakai
    // AmbilFoto, entah menyediakan input tanpa capture sendiri.
    const adaGaleri = /AmbilFoto|atributInput\(\s*'galeri'|data-foto-galeri/.test(isi)
    if (!adaGaleri) pelanggar.push(jalur.replace(akar, 'src'))
  }

  // OcrScanDialog memang khusus memotret dokumen di tempat — ia memindai apa
  // yang sedang dipegang, bukan melampirkan berkas. Disebutkan namanya supaya
  // pengecualiannya sadar, bukan tersembunyi di dalam pola.
  const dikecualikan = [
    'src/components/siteplan/OcrScanDialog.tsx',
    // Modul aturannya sendiri: di sinilah kata `capture` memang harus muncul.
    'src/lib/sumberFoto.ts',
  ]
  const nyata = pelanggar.filter(p => !dikecualikan.includes(p))
  assert(nyata.length === 0,
    `input foto tanpa jalan ke galeri:\n  ${nyata.join('\n  ')}`)

  // Dan halaman laporan tukang HARUS memakai AmbilFoto — inilah yang diminta.
  const lapor = readFileSync(join(akar, 'pages/LaporHarianPage.tsx'), 'utf8')
  assert(/AmbilFoto/.test(lapor), 'laporan lapangan memakai pemilih dua sumber')
  assert(!/capture=/.test(lapor),
    'dan tidak lagi menyetel capture sendiri — itu yang dulu mengunci ke kamera')
}

console.log(`sumber-foto: ${ok} assert lulus`)
