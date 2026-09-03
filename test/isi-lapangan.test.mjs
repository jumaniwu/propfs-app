// ============================================================
// Mengisi laporan lapangan DARI DALAM aplikasi.
//
// Sampai sekarang satu-satunya jalan adalah Link Pekerja: tautan bertoken
// yang dibuka di peramban luar. Untuk mandor yang memang tidak punya akun itu
// tepat. Untuk project manager dan pengawas yang SUDAH di dalam aplikasi, itu
// menyusahkan — aplikasinya harus ditinggalkan, dan tombol kembali membawa
// mereka ke halaman yang tidak menyegarkan dirinya, sehingga yang baru diisi
// tidak terlihat dan tidak ada cara tahu laporannya masuk selain mengisi lagi.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  pilihanBuku, bukuAwal, ingatBuku, namaPengisi, siapIsi, bukuTerpilih, cocokProyek,
} from '../src/lib/isiLapangan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

function laciPalsu(awal = {}) {
  const isi = new Map(Object.entries(awal))
  return { isi, getItem: k => (isi.has(k) ? isi.get(k) : null), setItem: (k, v) => isi.set(k, v) }
}

const LOGS = [
  { id: 'b2', project_name: 'Ruko Pak Soni', report_token: 't2' },
  { id: 'b1', project_name: 'Rumah Noble Cove', report_token: 't1' },
  { id: 'b3', project_name: 'Tanpa token', report_token: '' },
]

// ── 1. Buku tanpa token DIBUANG ─────────────────────────────────────
//
// Tanpa token tidak ada cara mengirim apa pun. Menawarkannya berarti
// menjanjikan sesuatu yang pasti gagal di ketukan terakhir — setelah seluruh
// formulirnya diisi.
{
  const p = pilihanBuku(LOGS)
  assert(p.length === 2, 'yang tanpa token tidak ditawarkan')
  assert(!p.some(x => x.id === 'b3'), 'benar-benar hilang dari daftar')
  assert(p[0].nama === 'Ruko Pak Soni', 'diurutkan menurut nama')
  assert(p[1].nama === 'Rumah Noble Cove', 'urutan abjad Indonesia')
  assert(p[0].token === 't2', 'tokennya terbawa')

  const tanpaNama = pilihanBuku([{ id: 'x', report_token: 'tx' }])
  assert(tanpaNama[0].nama === 'Tanpa nama proyek',
    'buku tanpa nama tetap bisa dipilih, dengan label yang jujur')
  assert(pilihanBuku(null).length === 0, 'kosong aman')
  assert(pilihanBuku([{ project_name: 'x', report_token: 't' }]).length === 0, 'tanpa id: dibuang')
}

// ── 2. Yang terakhir dipakai dibuka lebih dulu ──────────────────────
//
// Pengawas mengisi proyek yang sama setiap hari. Memaksanya memilih ulang tiap
// kali adalah satu ketukan yang terbuang setiap hari selamanya.
{
  const p = pilihanBuku(LOGS)
  const l = laciPalsu({ 'propfs:isi-lapangan:buku': 'b1' })
  assert(bukuAwal(p, l) === 'b1', 'yang terakhir dipakai')

  // Yang terakhir sudah tidak ada: JANGAN menebak di antara beberapa proyek.
  const hilang = laciPalsu({ 'propfs:isi-lapangan:buku': 'sudah-dihapus' })
  assert(bukuAwal(p, hilang) === '',
    'menebak di antara beberapa proyek berisiko mengirim laporan ke proyek yang salah')

  // Kalau memang tinggal satu, tidak ada yang bisa salah.
  const satu = pilihanBuku([LOGS[0]])
  assert(bukuAwal(satu, hilang) === 'b2', 'tinggal satu: langsung dipilih')
  assert(bukuAwal([], laciPalsu()) === '', 'tidak ada buku sama sekali')
  assert(bukuAwal(null) === '', 'kosong aman')
}

// ── 3. Pilihan diingat ─────────────────────────────────────────────
{
  const l = laciPalsu()
  ingatBuku('b2', l)
  assert(l.isi.get('propfs:isi-lapangan:buku') === 'b2', 'tersimpan')
  ingatBuku('', l)
  assert(l.isi.get('propfs:isi-lapangan:buku') === 'b2', 'kosong tidak menimpa pilihan yang sah')

  // Penyimpanan yang dilarang (mode penyamaran) tidak boleh menghentikan apa pun.
  const rusak = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
  ingatBuku('b1', rusak)
  assert(bukuAwal(pilihanBuku(LOGS), rusak) === '', 'laci rusak: aman, tidak melempar')
}

// ── 4. Nama pengisi diambil dari akun ─────────────────────────────
//
// Halaman bertoken memang harus bertanya — mandor di sana tidak punya akun.
// Di dalam aplikasi namanya sudah diketahui, dan menanyakannya lagi tiap hari
// hanya mengundang ejaan yang berbeda-beda: rekap absensi memecah "Yono",
// "yono", dan "Pak Yono" menjadi tiga orang.
{
  assert(namaPengisi({ nama: 'Jumani' }) === 'Jumani', 'nama dipakai')
  assert(namaPengisi({ email: 'jumani.wu@gmail.com' }) === 'jumani.wu',
    'tanpa nama: bagian depan email, bukan seluruh alamatnya')
  assert(namaPengisi({ nama: '  ', email: 'a@b.c' }) === 'a', 'nama kosong jatuh ke email')
  assert(namaPengisi(null) === '', 'kosong aman')
  assert(namaPengisi({}) === '', 'tanpa keduanya aman')
}

// ── 5. Layar menolak dengan sebab, bukan diam ────────────────────
{
  const p = pilihanBuku(LOGS)
  const kosong = siapIsi([], '')
  assert(kosong.boleh === false, 'tanpa buku: belum bisa')
  assert(/Laporan Lapangan/.test(kosong.alasan), 'dan menunjuk tempat membuatnya')

  assert(siapIsi(p, '').boleh === false, 'belum memilih proyek')
  assert(/Pilih dulu/.test(siapIsi(p, '').alasan), 'dikatakan')

  const basi = siapIsi(p, 'b3')
  assert(basi.boleh === false, 'proyek yang sudah tidak ada')
  assert(/sudah tidak ada/.test(basi.alasan), 'dan sebabnya jelas')

  assert(siapIsi(p, 'b1').boleh === true, 'lengkap: boleh')
}

// ── 6. Buku terpilih ────────────────────────────────────────────
{
  const p = pilihanBuku(LOGS)
  assert(bukuTerpilih(p, 'b1').token === 't1', 'tokennya ketemu')
  assert(bukuTerpilih(p, 'entah') === null, 'yang tidak ada: null, bukan undefined liar')
  assert(bukuTerpilih(null, 'b1') === null, 'kosong aman')
}

// ── 7. Pencocokan nama proyek ──────────────────────────────────
{
  assert(cocokProyek('Ruko Pak Soni', ' ruko pak soni ') === true, 'beda spasi & huruf besar')
  assert(cocokProyek('Ruko Pak Soni', 'Noble Cove') === false, 'proyek berbeda')
  assert(cocokProyek('', '') === false, 'dua-duanya kosong bukan berarti cocok')
  assert(cocokProyek(null, null) === false, 'kosong aman')
}

// ── 8. Halamannya memakai jalur data yang SAMA ─────────────────
//
// Membuat jalur kedua ke tabel yang sama berarti dua tempat yang bisa
// berselisih — dan sesi ini sudah penuh contoh apa yang terjadi setelahnya.
{
  const akar = new URL('../src', import.meta.url).pathname
  const hal = readFileSync(join(akar, 'pages/IsiLapanganPage.tsx'), 'utf8')
  assert(/getLogByReportToken\(/.test(hal), 'header & pekerja diambil lewat token buku')
  assert(/FormAbsensi|FormLaporan/.test(hal),
    'formulirnya dipakai ulang, bukan disalin — salinan kedua akan tertinggal '
    + 'begitu salah satunya diperbaiki')
  assert(/pilihanBuku\(/.test(hal) && /bukuAwal\(/.test(hal), 'pemilih proyeknya terpasang')
}

console.log(`isi-lapangan: ${ok} assert lulus`)
