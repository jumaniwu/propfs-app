// ============================================================
// Layar kosong harus mengatakan sebabnya.
//
// "Belum ada absensi tercatat" muncul untuk tiga keadaan yang sama sekali
// berbeda: permintaannya ditolak, bukunya memang kosong, atau laporannya ada
// tapi tanpa absensi. Yang pertama paling berbahaya karena berbunyi seperti
// yang kedua — orang menyimpulkan datanya hilang padahal datanya utuh dan
// hanya tidak terambil.
//
// Yang diuji di sini bukan tampilannya, melainkan apakah kalimatnya memang
// BERBEDA untuk sebab yang berbeda, dan apakah ia menolak mengatakan hal
// yang menenangkan ketika keadaannya belum diketahui.
// ============================================================
import { readFileSync } from 'node:fs'
import { diagnosaAbsensi } from '../src/lib/diagnosaAbsensi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Gagal memuat ─────────────────────────────────────────────────
//
// Inilah yang dulu ditelan `.catch(() => setReports([]))`.
{
  const d = diagnosaAbsensi({
    galat: 'Gagal memuat laporan (HTTP 401).',
    jumlahLaporan: 0, jumlahBerabsensi: 0,
  })
  assert(d.nada === 'galat', 'kegagalan dikenali sebagai kegagalan')
  assert(d.pesan.includes('HTTP 401'), 'galat aslinya ikut disebut, bukan disembunyikan')
  assert(/bukan berarti datanya hilang/i.test(d.pesan),
    'menolak membiarkan orang menyimpulkan datanya hilang')
  assert(!/belum ada/i.test(d.judul), 'tidak berpura-pura bahwa memang belum ada isinya')
  assert((d.saran ?? '').includes('migration_klaim_keanggotaan.sql'),
    'menyebut langkah yang paling sering jadi sebabnya')
}

// Kegagalan diperiksa LEBIH DULU daripada angka apa pun. Angka di bawahnya
// tidak berarti apa-apa bila daftarnya tidak pernah sampai.
{
  const d = diagnosaAbsensi({
    galat: 'Gagal memuat laporan (HTTP 500).',
    jumlahLaporan: 0, jumlahBerabsensi: 0,
    bukuLain: [{ nama: 'Rumah Noble Cove', jumlah: 12 }],
  })
  assert(d.nada === 'galat', 'galat menang atas dugaan buku kembar')
}

// Waktu habis BUKAN penolakan izin, dan sarannya tidak boleh sama.
//
// Inilah yang benar-benar terjadi di ponsel: datanya ada, terbaca di laptop,
// tapi permintaannya terlalu berat untuk data seluler. Menyuruh orang
// menjalankan migrasi database untuk ini membuatnya membongkar hal yang
// tidak rusak.
{
  const d = diagnosaAbsensi({
    galat: 'Waktu habis — periksa koneksi internet lalu coba lagi.',
    jumlahLaporan: 0, jumlahBerabsensi: 0,
  })
  assert(d.nada === 'galat', 'tetap dikenali sebagai kegagalan')
  assert(/[Ww]aktu habis/.test(d.judul), 'judulnya menyebut waktu habis, bukan gagal umum')
  assert(!/migration_/.test(d.saran ?? ''), 'TIDAK menyuruh menjalankan migrasi')
  assert(/jangan menjalankan migrasi/i.test(d.saran ?? ''),
    'justru melarangnya, karena saran keliru lebih buruk daripada tanpa saran')
  assert(/Wi-Fi/i.test(d.saran ?? ''), 'menyarankan jaringan yang lebih baik')
  assert(/ponsel/i.test(d.saran ?? ''), 'menyebut beda komputer dan ponsel')
}

// Penolakan izin tetap mendapat sarannya sendiri.
{
  const d = diagnosaAbsensi({
    galat: 'Gagal memuat laporan (HTTP 403).', jumlahLaporan: 0, jumlahBerabsensi: 0,
  })
  assert((d.saran ?? '').includes('migration_klaim_keanggotaan.sql'),
    'yang bukan timeout tetap diarahkan ke migrasi')
}

// ── 2. Memang belum ada isinya ──────────────────────────────────────
{
  const d = diagnosaAbsensi({ jumlahLaporan: 0, jumlahBerabsensi: 0 })
  assert(d.nada === 'kosong', 'buku kosong dikenali')
  assert(/belum menerima/i.test(d.pesan), 'dikatakan apa adanya')
  assert(/Link Pekerja/.test(d.saran ?? ''), 'menyebut dari mana absensi diisi')
  assert(!/hilang|gagal/i.test(d.pesan), 'tidak menakut-nakuti tanpa sebab')
}

// ── 3. Ada laporannya, tapi tanpa absensi ───────────────────────────
//
// Keadaan yang paling sering disalahartikan sebagai data hilang.
{
  const d = diagnosaAbsensi({ jumlahLaporan: 23, jumlahBerabsensi: 0 })
  assert(d.nada === 'tanpaAbsensi', 'dibedakan dari buku yang kosong')
  assert(d.judul.includes('23'), 'jumlah laporannya disebutkan')
  assert(/tidak hilang/i.test(d.pesan), 'menegaskan laporannya masih ada')
  assert(/Laporan Harian/.test(d.pesan), 'menunjukkan di mana laporannya bisa dilihat')
}

// ── 4. Buku kembar ──────────────────────────────────────────────────
//
// Datanya tidak hilang, hanya masuk ke buku yang berbeda. Yang dibutuhkan
// menggabungkan, bukan mengisi ulang apa pun.
{
  const d = diagnosaAbsensi({
    jumlahLaporan: 0, jumlahBerabsensi: 0,
    bukuLain: [{ nama: 'Rumah Noble Cove', jumlah: 12 }],
  })
  assert(d.nada === 'adaDiBukuLain', 'buku kembar dikenali')
  assert(/tidak hilang/i.test(d.pesan), 'menegaskan datanya tidak hilang')
  assert(d.pesan.includes('12'), 'jumlah laporan di buku lain disebutkan')
  assert(/Gabungkan/i.test(d.saran ?? ''), 'menyuruh menggabungkan')
  assert(/[Jj]angan menghapus/.test(d.saran ?? ''), 'melarang menghapus bukunya')
}

// Buku lain yang KOSONG bukan petunjuk apa-apa, jadi tidak boleh dihitung.
{
  const d = diagnosaAbsensi({
    jumlahLaporan: 0, jumlahBerabsensi: 0,
    bukuLain: [{ nama: 'Rumah Noble Cove', jumlah: 0 }],
  })
  assert(d.nada === 'kosong', 'buku lain yang kosong tidak dianggap petunjuk')
}

// Ada laporan di buku ini TANPA absensi, sementara buku kembar juga berisi:
// keduanya perlu disebut, karena absensinya mungkin ada di sebelah.
{
  const d = diagnosaAbsensi({
    jumlahLaporan: 5, jumlahBerabsensi: 0,
    bukuLain: [{ nama: 'Rumah Noble Cove', jumlah: 9 }],
  })
  assert(d.nada === 'tanpaAbsensi', 'yang di buku ini tetap jadi pokoknya')
  assert(d.pesan.includes('9'), 'buku kembar tetap disebut sebagai kemungkinan')
  assert(/gabungkan/i.test(d.pesan), 'menyarankan menggabungkan juga di sini')
}

// ── 4b. Ada, tapi tidak boleh dibaca ────────────────────────────────
//
// Keadaan yang sebenarnya terjadi pada buku Noble Cove: laporannya utuh,
// tapi bukunya dibuat atas nama pengawas dan RLS menyaringnya. RLS TIDAK
// melempar galat — ia mengembalikan 200 dengan larik kosong, persis seperti
// buku yang memang belum berisi. Hanya pembanding lewat jalur bertoken yang
// bisa membedakannya.
{
  const d = diagnosaAbsensi({ jumlahLaporan: 0, jumlahBerabsensi: 0, tersembunyi: 23 })
  assert(d.nada === 'tersaring', 'penyaringan izin dikenali, bukan disebut kosong')
  assert(d.judul.includes('23'), 'jumlah yang tidak terbaca disebutkan')
  assert(/TIDAK hilang/.test(d.pesan), 'menegaskan datanya utuh')
  assert(/izin/i.test(d.pesan), 'menyebut izin sebagai sebabnya')
  assert((d.saran ?? '').includes('migration_klaim_keanggotaan.sql'), 'menyebut migrasinya')
  assert(/GitHub TIDAK menjalankan SQL/i.test(d.saran ?? ''),
    'meluruskan bahwa menerbitkan ulang aplikasi tidak menjalankan migrasi')
}

// Tersaring SEBAGIAN: sebagian terbaca, sebagian tidak. Yang tidak terbaca
// tetap harus disebut, bukan ditelan karena "kan sudah ada isinya".
{
  const d = diagnosaAbsensi({ jumlahLaporan: 4, jumlahBerabsensi: 0, tersembunyi: 23 })
  assert(d.nada === 'tersaring', 'sebagian tersaring tetap dikenali')
  assert(d.judul.includes('19'), 'selisih yang tidak terbaca yang disebut')
  assert(d.pesan.includes('4'), 'yang terbaca ikut disebut')
}

// Jumlah yang sama berarti tidak ada yang disaring — jangan menuduh.
{
  const d = diagnosaAbsensi({ jumlahLaporan: 0, jumlahBerabsensi: 0, tersembunyi: 0 })
  assert(d.nada === 'kosong', 'nol lawan nol bukan penyaringan')
  const e = diagnosaAbsensi({ jumlahLaporan: 5, jumlahBerabsensi: 0, tersembunyi: 5 })
  assert(e.nada === 'tanpaAbsensi', 'jumlah yang sama bukan penyaringan')
}

// Penyaringan kalah dari absensi yang sudah terbaca: kalau rekapnya sudah
// terisi, tidak ada gunanya menakut-nakuti.
{
  const d = diagnosaAbsensi({ jumlahLaporan: 5, jumlahBerabsensi: 5, tersembunyi: 99 })
  assert(d.nada === 'ada', 'rekap yang sudah terisi tidak diganggu')
}

// Tapi galat tetap menang atas segalanya: kalau daftarnya tidak pernah
// sampai, angka pembandingnya tidak bisa dipercaya.
{
  const d = diagnosaAbsensi({
    galat: 'HTTP 500.', jumlahLaporan: 0, jumlahBerabsensi: 0, tersembunyi: 23,
  })
  assert(d.nada === 'galat', 'galat menang atas dugaan penyaringan')
}

// ── 5. Ada absensinya ───────────────────────────────────────────────
{
  const d = diagnosaAbsensi({ jumlahLaporan: 23, jumlahBerabsensi: 18 })
  assert(d.nada === 'ada', 'keadaan normal dikenali')
  assert(d.judul.includes('18'), 'jumlah yang berabsensi disebutkan')
}

// ── 6. Masukan cacat tidak meledak ──────────────────────────────────
{
  assert(diagnosaAbsensi(null).nada === 'kosong', 'null tidak meledak')
  assert(diagnosaAbsensi(undefined).nada === 'kosong', 'undefined tidak meledak')
  assert(diagnosaAbsensi({}).nada === 'kosong', 'objek kosong tidak meledak')
  const d = diagnosaAbsensi({ jumlahLaporan: -3, jumlahBerabsensi: -1 })
  assert(d.nada === 'kosong', 'angka negatif tidak membuat kalimat aneh')
  assert(!d.judul.includes('-'), 'angka negatif tidak bocor ke layar')
}

// ── 7. Setiap keadaan punya kalimat sendiri ─────────────────────────
//
// Inilah inti perbaikannya: dulu semuanya satu kalimat.
{
  const semua = [
    diagnosaAbsensi({ galat: 'HTTP 401.', jumlahLaporan: 0, jumlahBerabsensi: 0 }),
    diagnosaAbsensi({ jumlahLaporan: 0, jumlahBerabsensi: 0 }),
    diagnosaAbsensi({ jumlahLaporan: 5, jumlahBerabsensi: 0 }),
    diagnosaAbsensi({ jumlahLaporan: 0, jumlahBerabsensi: 0, bukuLain: [{ nama: 'x', jumlah: 3 }] }),
    diagnosaAbsensi({ jumlahLaporan: 5, jumlahBerabsensi: 5 }),
    diagnosaAbsensi({ jumlahLaporan: 0, jumlahBerabsensi: 0, tersembunyi: 23 }),
  ]
  assert(new Set(semua.map(d => d.nada)).size === 6, '6 keadaan, 6 nada berbeda')
  assert(new Set(semua.map(d => d.judul)).size === 6, '6 judul berbeda')
  assert(new Set(semua.map(d => d.pesan)).size === 6, '6 penjelasan berbeda')
  assert(semua.every(d => d.judul && d.pesan), 'tidak ada yang kosong')
}

// ── 8. Galatnya benar-benar tidak ditelan lagi ──────────────────────
//
// Diagnosis sebagus apa pun tidak berguna kalau galatnya sudah dibuang
// sebelum sampai ke sini.
{
  const src = readFileSync(
    new URL('../src/components/cost/TabLaporanLapangan.tsx', import.meta.url), 'utf8')
  // Komentar dibuang dulu: catatan di berkas itu SENGAJA mengutip kode lama
  // supaya alasannya tidak hilang, dan kutipan itu bukan kode yang berjalan.
  const kode = src.split('\n').filter(b => !/^\s*(\/\/|\*|\/\*)/.test(b)).join('\n')
  assert(!/catch\(\(\)\s*=>\s*setReports\(\[\]\)\)/.test(kode),
    'catch yang membuang galat laporan sudah tidak ada di kode yang berjalan')
  assert(/catch\(\(\)\s*=>\s*setReports\(\[\]\)\)/.test(src),
    'alasannya tetap tercatat sebagai komentar, supaya tidak dikembalikan orang')
  assert(/setReportsError/.test(src), 'galatnya disimpan ke state')
  assert(/galat=\{reportsError\}/.test(src), 'galatnya diteruskan ke panel absensi')
  assert(/bukuLain=\{bukuLain\}/.test(src), 'buku kembar diteruskan ke panel absensi')
  assert(/getOwnerView\(/.test(src),
    'jalur bertoken dipakai sebagai pembanding — RLS tidak pernah melempar galat')
  assert(/tersembunyi=\{tersembunyi\}/.test(src), 'hasil pembandingnya diteruskan')

  const panel = readFileSync(
    new URL('../src/components/cost/PanelRekapAbsensi.tsx', import.meta.url), 'utf8')
  assert(/diagnosaAbsensi\(/.test(panel), 'panel memakai diagnosisnya')
  assert(!/Belum ada absensi tercatat\. Absensi diisi mandor/.test(panel),
    'kalimat serba-guna yang lama sudah tidak ada')
}

console.log(`diagnosa-absensi: ${ok} assert lulus`)
