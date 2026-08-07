// Test anggaran waktu untuk satu pekerjaan yang punya perulangan.
import {
  WAKTU_HABIS, buatAnggaran, pantasDicobaLagi, galatWaktuHabis,
} from '../src/lib/anggaranWaktu.ts'
import { jenisGalat, bisaDiulang, ringkasGalatAi } from '../src/lib/galatAi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

/** Jam palsu, supaya perilaku 100 detik bisa diuji dalam sekejap. */
function jam(mulai = 1_000_000) {
  let t = mulai
  return { sekarang: () => t, maju: ms => { t += ms } }
}

// ── Inti keluhan: batas per panggilan MEMBERI MAKAN perulangan ──────────
//
// Chat AI menggantung, jadi batas 75 detik dipasang pada tiap panggilan.
// Tetapi pemanggilnya punya perulangan 2 model × 2 percobaan, dan pemutusan
// oleh batas itu berbunyi "The operation was aborted" — yang dibaca sebagai
// gangguan jaringan, dan gangguan jaringan LAYAK DIULANG. Di layar pemakainya
// terhitung 102 detik dan masih berputar: tepat di tengah percobaan kedua.
{
  assert(jenisGalat('The operation was aborted') === 'jaringan',
    'prasyarat: pemutusan mentah memang terbaca sebagai jaringan…')
  assert(bisaDiulang('jaringan') === true, '…dan jaringan memang layak diulang')

  // Karena itu pemutusan OLEH ANGGARAN harus punya penanda sendiri.
  const e = galatWaktuHabis(45)
  assert(e.message.includes(WAKTU_HABIS), 'galat anggaran membawa penandanya')
  assert(jenisGalat(e) === 'waktu', 'dan dibaca sebagai jenis tersendiri, bukan jaringan')
  assert(jenisGalat(e) !== 'jaringan', 'inilah yang memutus lingkaran pengulangan')
  assert(/45 detik/.test(e.message), 'angkanya disebut supaya cocok dengan penghitung di layar')
  assert(/ketik/i.test(e.message), 'dan diberi jalan keluar, bukan hanya kabar buruk')
}

// ── Anggaran satu pekerjaan, bukan satu panggilan ───────────────────────
{
  const j = jam()
  const a = buatAnggaran(70_000, j.sekarang)
  assert(a.sisa() === 70_000, 'anggaran penuh saat dibuat')
  assert(a.habis() === false, 'dan belum habis')

  j.maju(45_000)
  assert(a.sisa() === 25_000, 'percobaan pertama memakan jatahnya dari kantong yang sama')
  assert(a.jatah(45_000) === 25_000,
    'percobaan berikutnya TIDAK dapat jatah penuh lagi — hanya sisa yang ada')

  j.maju(25_000)
  assert(a.habis() === true, 'anggarannya habis')
  assert(a.sisa() === 0, 'sisanya nol, tidak negatif')
  assert(a.jatah(45_000) === 0, 'dan tidak ada jatah lagi untuk siapa pun')
}
{
  // Yang dulu terjadi: 4 percobaan × 75 detik = 5 menit. Dengan anggaran,
  // seluruh pekerjaan berhenti di 70 detik berapa pun sisa jatah percobaannya.
  const j = jam()
  const a = buatAnggaran(70_000, j.sekarang)
  let percobaan = 0
  while (pantasDicobaLagi(a)) { percobaan++; j.maju(a.jatah(45_000)) }
  assert(percobaan === 2, `hanya dua percobaan yang muat, bukan empat: ${percobaan}`)
  assert(a.sisa() === 0, 'dan totalnya tidak melewati anggaran')
}

// ── Sisa yang terlalu tipis: jangan dicoba sama sekali ──────────────────
{
  // Percobaan yang sudah pasti terputus di tengah jalan hanya menghabiskan
  // sisa kesabaran pemakainya, lalu tetap berakhir dengan pesan gagal.
  const j = jam()
  const a = buatAnggaran(70_000, j.sekarang)
  j.maju(65_000)
  assert(a.sisa() === 5_000, 'sisa 5 detik')
  assert(pantasDicobaLagi(a) === false, 'terlalu tipis untuk dicoba')
  assert(a.habis() === false, 'meski anggarannya belum benar-benar habis')
}
assert(pantasDicobaLagi(buatAnggaran(70_000)) === true, 'anggaran penuh tentu pantas dicoba')
assert(pantasDicobaLagi(buatAnggaran(0)) === false, 'anggaran nol tidak pantas dicoba')

// ── Masukan yang aneh ───────────────────────────────────────────────────
assert(buatAnggaran(-5000).sisa() === 0, 'anggaran negatif dianggap nol')
assert(buatAnggaran(NaN).sisa() === 0, 'NaN dianggap nol')
{
  const a = buatAnggaran(10_000)
  assert(a.jatah(-100) === 0, 'jatah negatif dianggap nol')
  assert(a.jatah(NaN) === 0, 'jatah NaN dianggap nol')
  assert(a.jatah(999_999) <= 10_000, 'jatah tidak pernah melebihi sisa')
}

// ── Pesan untuk pemakainya ──────────────────────────────────────────────
{
  const r = ringkasGalatAi([galatWaktuHabis(45)], { adaGambar: true })
  assert(r.jenis === 'waktu', 'diringkas sebagai masalah waktu')
  assert(!/padat|sibuk/i.test(r.pesan), 'bukan disebut kepadatan layanan')
  assert(/foto/i.test(r.pesan), 'dengan foto: disarankan mengurangi fotonya')
  assert(/ketik/i.test(r.pesan), 'dan mengetik manual sebagai jalan tercepat')
}
{
  const r = ringkasGalatAi([galatWaktuHabis(45)], { adaGambar: false })
  assert(!/foto/i.test(r.pesan), 'tanpa foto, sarannya tidak menyesatkan')
}
{
  // Masalah waktu didahulukan atas kepadatan — yang bisa ditindak menang.
  const r = ringkasGalatAi(['HTTP 503', galatWaktuHabis(45)])
  assert(r.jenis === 'waktu', 'tenggat yang terlampaui lebih bisa ditindak daripada "sedang padat"')
}

// ── Sesi AI: tahan terhadap perulangan yang MENELAN galat ───────────────
//
// Inilah yang membuat perbaikan ini tidak bergantung pada kelalaian. Beberapa
// fitur punya perulangan bergaya `catch { continue }` — galat ditelan, lanjut
// ke percobaan berikutnya. Perulangan seperti itu tidak akan pernah membaca
// jenis galat apa pun, jadi memberitahunya "ini tidak layak diulang" percuma.
//
// Yang bekerja: begitu anggarannya menipis, panggilan berikutnya MELEMPAR
// seketika tanpa menyentuh jaringan. Perulangannya tetap berputar, tetapi habis
// dalam hitungan milidetik alih-alih berjam-jam.
{
  const j = jam()
  const a = buatAnggaran(70_000, j.sekarang)
  j.maju(65_000)

  let putaran = 0
  // Perulangan yang paling ceroboh sekalipun: sepuluh percobaan, semua galat
  // ditelan, tidak ada satu pun pemeriksaan.
  for (let i = 0; i < 10; i++) {
    try {
      if (!pantasDicobaLagi(a)) throw galatWaktuHabis(70)
      putaran++
    } catch { /* ditelan, seperti di beberapa modul */ }
  }
  assert(putaran === 0, 'tidak ada satu pun panggilan jaringan yang dijalankan')
  assert(a.sisa() === 5_000, 'dan tidak ada waktu tambahan yang terpakai')
}

console.log(`anggaran-waktu: ${ok} assert lulus`)
