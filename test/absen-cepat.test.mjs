// ============================================================
// Absen dengan mencentang, bukan menambah satu per satu.
//
// Bentuk lamanya menuntut DUA langkah per orang: ketuk namanya supaya
// barisnya muncul, lalu pilih statusnya di antara empat tombol. Untuk lima
// belas tukang itu tiga puluh ketukan setiap sore, dari HP, oleh orang yang
// baru selesai memegang semen.
//
// Yang sebenarnya terjadi di lapangan lebih sederhana: hampir semua orang
// masuk, dan yang perlu ditandai justru YANG TIDAK.
//
// Ini bukan soal kenyamanan. Absensi yang merepotkan diisi belakangan,
// dikira-kira dari ingatan, atau tidak diisi sama sekali — dan upah dihitung
// dari situ.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  susunCentang, centangKeAbsensi, alihCentang, ubahBaris,
  centangSemua, lepasSemua, ringkasCentang, kalimatCentang,
} from '../src/lib/absenCepat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const pekerja = [
  { id: 'p1', nama: 'Alpin', peran: 'Helper', no_hp: '', jenis: 'harian', upah_harian: 120000, foto: '', aktif: true },
  { id: 'p2', nama: 'Erik', peran: 'Tukang', no_hp: '', jenis: 'harian', upah_harian: 150000, foto: '', aktif: true },
  { id: 'p3', nama: 'Randi', peran: 'Helper', no_hp: '', jenis: 'harian', upah_harian: 120000, foto: '', aktif: true },
]

// ── 1. SELURUH pekerja terdaftar muncul, dicentang atau tidak ─────────
//
// Inti bentuk ini. Daftar yang hanya menampilkan yang sudah diabsen tidak
// pernah mengingatkan siapa yang terlewat — dan yang terlewat adalah orang
// yang tidak dibayar.
{
  const d = susunCentang(pekerja, [])
  assert(d.length === 3, 'ketiganya tampil meski belum ada yang diabsen')
  assert(d.every(r => r.dicentang === false), 'awalnya tidak ada yang tercentang')
  assert(d.every(r => r.status === 'hadir'), 'status bawaan hadir — mencentang saja sudah cukup')
  assert(d[0].nama === 'Alpin' && d[0].peran === 'Helper', 'nama & perannya terbawa')
}

// ── 2. Absensi yang sudah ada muncul dalam keadaan tercentang ────────
{
  const d = susunCentang(pekerja, [
    { pekerja_id: 'p2', nama: 'Erik', status: 'setengah', lembur: 2 },
  ])
  const erik = d.find(r => r.nama === 'Erik')
  assert(erik.dicentang === true, 'yang sudah diabsen: tercentang')
  assert(erik.status === 'setengah' && erik.lembur === 2, 'status & lemburnya utuh')
  assert(d.filter(r => r.dicentang).length === 1, 'yang lain tetap kosong')
}

// ── 3. Pekerja nonaktif tidak lagi ditawarkan ────────────────────────
{
  const d = susunCentang(
    [...pekerja, { id: 'p4', nama: 'Mantan', peran: '', no_hp: '', jenis: 'harian', upah_harian: 0, foto: '', aktif: false }],
    [])
  assert(!d.some(r => r.nama === 'Mantan'), 'yang sudah berhenti tidak muncul di absen harian')
}

// ── 4. Absensi orang yang sudah tidak terdaftar TIDAK dibuang ────────
//
// Membuangnya berarti diam-diam menghapus kehadiran yang sudah dicatat — dan
// yang menghilang justru catatan orang yang sudah berhenti, yaitu orang yang
// paling mungkin masih menagih upah.
{
  const d = susunCentang(pekerja, [{ nama: 'Kabol', status: 'hadir' }])
  const kabol = d.find(r => r.nama === 'Kabol')
  assert(kabol, 'tetap muncul')
  assert(kabol.yatim === true, 'dan ditandai supaya bisa dibedakan di layar')
  assert(kabol.dicentang === true, 'kehadirannya tidak hilang')
  assert(d.indexOf(kabol) === d.length - 1, 'ditaruh di bawah, tidak menyela daftar utama')
}

// ── 5. Nama yang sama tidak muncul dua kali ─────────────────────────
//
// Baris lama tanpa `pekerja_id` dicocokkan lewat namanya. Tanpa itu, "Erik"
// muncul dua kali dan rekap upahnya membayar dua hari untuk satu hari kerja.
{
  const d = susunCentang(pekerja, [{ nama: 'erik', status: 'hadir' }])
  assert(d.filter(r => r.nama.toLowerCase() === 'erik').length === 1,
    'baris lama tanpa pekerja_id menempel ke pekerja yang sama, bukan jadi orang kedua')
  assert(d.find(r => r.nama === 'Erik').dicentang === true, 'dan tercentang')
}

// ── 6. Hanya yang dicentang yang dikirim ────────────────────────────
{
  let d = susunCentang(pekerja, [])
  d = alihCentang(d, 'p1')
  d = alihCentang(d, 'p3')
  const kirim = centangKeAbsensi(d)
  assert(kirim.length === 2, 'dua yang dicentang')
  assert(kirim.every(b => b.status === 'hadir'), 'statusnya ikut')
  assert(kirim.every(b => b.pekerja_id), 'pekerja_id ikut supaya rekap tidak bergantung ejaan nama')
  assert(!kirim.some(b => b.nama === 'Erik'), 'yang tidak dicentang tidak ikut sama sekali')
}

// ── 7. Lembur 0 TIDAK ikut dikirim ─────────────────────────────────
//
// Menulis `lembur: 0` ke setiap baris membuat rekap yang membedakan "tanpa
// lembur" dari "belum diisi" kehilangan bedanya.
{
  let d = centangSemua(susunCentang(pekerja, []))
  d = ubahBaris(d, 'p1', { lembur: 3 })
  const kirim = centangKeAbsensi(d)
  assert(kirim.find(b => b.nama === 'Alpin').lembur === 3, 'lembur yang diisi ikut')
  assert(!('lembur' in kirim.find(b => b.nama === 'Erik')), 'lembur nol tidak ditulis')
}

// ── 8. Melepas centang tidak menghapus status & lemburnya ──────────
//
// Salah ketuk yang menghapus pekerjaan sepuluh detik lalu adalah alasan orang
// berhenti memakai sebuah layar.
{
  let d = susunCentang(pekerja, [{ pekerja_id: 'p1', nama: 'Alpin', status: 'setengah', lembur: 2 }])
  d = alihCentang(d, 'p1')
  assert(d[0].dicentang === false, 'terlepas')
  assert(d[0].status === 'setengah' && d[0].lembur === 2, 'isinya masih ada')
  d = alihCentang(d, 'p1')
  assert(d[0].status === 'setengah' && d[0].lembur === 2, 'dicentang lagi: kembali seperti semula')
}

// ── 9. Menandai izin/alpa otomatis mencentangnya ───────────────────
//
// Yang menandai seseorang izin jelas bermaksud memasukkannya ke catatan hari
// itu. Kalau tidak, ia cukup membiarkan kotaknya kosong.
{
  let d = susunCentang(pekerja, [])
  d = ubahBaris(d, 'p2', { status: 'izin' })
  const erik = d.find(r => r.nama === 'Erik')
  assert(erik.dicentang === true, 'izin: ikut tercentang sendiri')
  assert(erik.status === 'izin', 'statusnya benar')

  // Lembur tidak masuk akal untuk yang tidak masuk.
  let e = ubahBaris(susunCentang(pekerja, []), 'p2', { lembur: 3 })
  e = ubahBaris(e, 'p2', { status: 'alpa' })
  assert(e.find(r => r.nama === 'Erik').lembur === 0,
    'lembur dihapus saat ditandai alpa — jam lembur orang yang tidak masuk tidak masuk akal')
}

// ── 10. Hadirkan semua: pekerjaan paling sering di layar ini ───────
{
  const semua = centangSemua(susunCentang(pekerja, []))
  assert(semua.every(r => r.dicentang && r.status === 'hadir'), 'ketiganya hadir sekali ketuk')

  // Yang sudah ditandai izin TIDAK ditimpa jadi hadir.
  let d = ubahBaris(susunCentang(pekerja, []), 'p2', { status: 'izin' })
  d = centangSemua(d)
  assert(d.find(r => r.nama === 'Erik').status === 'izin',
    '"hadirkan semua" tidak menimpa orang yang sudah sengaja ditandai izin')

  assert(lepasSemua(semua).every(r => !r.dicentang), 'bisa dikosongkan lagi')
}

// ── 11. Ringkasan & kalimatnya menyebut yang BELUM ditandai ────────
{
  let d = susunCentang(pekerja, [])
  d = ubahBaris(centangSemua(d), 'p2', { status: 'izin' })
  d = ubahBaris(d, 'p1', { status: 'setengah', lembur: 2 })
  const r = ringkasCentang(d)
  assert(r.dicentang === 3 && r.total === 3, 'tiga dari tiga')
  assert(r.hadir === 1 && r.setengah === 1 && r.izin === 1, 'tiap status terhitung')
  assert(r.hok === 1.5, 'HOK: hadir 1 + setengah 0,5; izin tidak dibayar')
  assert(r.jamLembur === 2, 'lembur terpisah dari HOK')

  const sebagian = ringkasCentang(alihCentang(d, 'p3'))
  assert(/1 belum ditandai/.test(kalimatCentang(sebagian)),
    'yang belum ditandai disebut — itulah orang yang tidak akan dibayar')

  assert(/Belum ada yang dicentang/.test(kalimatCentang(ringkasCentang(susunCentang(pekerja, [])))),
    'nol: dikatakan terang-terangan')
  assert(kalimatCentang(ringkasCentang([])) === 'Belum ada pekerja terdaftar', 'tanpa pekerja')
  assert(typeof kalimatCentang(null) === 'string', 'kosong aman')
}

// ── 12. Masukan kosong tidak melempar ──────────────────────────────
{
  assert(susunCentang(null, null).length === 0, 'kosong aman')
  assert(centangKeAbsensi(null).length === 0, 'kosong aman')
  assert(susunCentang(pekerja, [{ nama: '   ', status: 'hadir' }]).filter(r => r.yatim).length === 0,
    'baris tanpa nama diabaikan, bukan jadi baris kosong di daftar')
}

// ── 13. Menyentuh status APA PUN memasukkan orangnya ke hitungan ────
//
// Ditemukan oleh probe peramban, bukan oleh uji ini. Tombol statusnya semula
// hanya muncul SETELAH barisnya dicentang — sehingga menandai seseorang izin
// menuntut mencentangnya hadir lebih dulu, yaitu mencatat kebalikan dari yang
// dimaksud. Keadaan yang tidak bisa dicapai lebih buruk daripada layar yang
// sedikit lebih ramai.
{
  for (const st of ['hadir', 'setengah', 'izin', 'alpa']) {
    const d = ubahBaris(susunCentang(pekerja, []), 'p2', { status: st })
    const erik = d.find(r => r.nama === 'Erik')
    assert(erik.dicentang === true, `status ${st} pada baris kosong ikut mencentangnya`)
    assert(erik.status === st, `dan statusnya ${st}`)
    assert(centangKeAbsensi(d).some(b => b.nama === 'Erik'), `status ${st} benar-benar terkirim`)
  }
}

// ── 14. Tombol statusnya memang selalu ada di layar ─────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const hal = readFileSync(join(akar, 'pages/LaporHarianPage.tsx'), 'utf8')
  assert(!/\{r\.dicentang && \(\s*<div className="mt-2 pl-8/.test(hal),
    'tombol status tidak lagi disembunyikan di balik centang')
  assert(/data-status=\{`\$\{r\.kunci\}-\$\{st\.key\}`\}/.test(hal), 'tombolnya ada')
  assert(/dicentang: true/.test(hal), 'dan menekannya ikut mencentang')

  // Absensi tidak boleh punya dua penulis.
  assert(!/<BlokAbsensi/.test(hal),
    'laporan harian tidak lagi ikut menulis absensi — dua tempat yang menulis '
    + 'fakta yang sama pasti berselisih suatu hari')

  const owner = readFileSync(join(akar, 'pages/ProgressKalenderPage.tsx'), 'utf8')
  assert(!/ChipAbsensi|rekapAbsensi/.test(owner),
    'halaman owner tidak menampilkan absensi tukang')
}

console.log(`absen-cepat: ${ok} assert lulus`)
