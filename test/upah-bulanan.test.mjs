// ============================================================
// Upah bulanan & buku laporan milik siapa.
//
// Dua keluhan yang datang bersamaan, dan yang pertama menjelaskan yang kedua:
// laporan harian proyek Pak Soni "hilang", dan absensi tukang belum bisa
// dijadikan daftar gaji.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  rekapUpahBulanan, rekapUpahMingguan, labelBulanUpah, upahBelumDiisiBulan,
  peringatanCetakUpah,
} from '../src/lib/pekerjaLapangan.ts'
import {
  bukuMilikProyek, kelompokkanBuku, bolehBuatBuku, pesanBelumPunyaBuku,
} from '../src/lib/bukuLaporan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const pekerja = [
  { id: 'p1', nama: 'Ujang', peran: 'Tukang batu', no_hp: '', jenis: 'harian', upah_harian: 150000, foto: '', aktif: true },
  { id: 'p2', nama: 'Deden', peran: 'Kenek', no_hp: '', jenis: 'borongan', upah_harian: 0, foto: '', aktif: true },
]
const hadir = (id, nama, status = 'hadir', lembur = 0) => ({ pekerja_id: id, nama, status, lembur })

// ── 1. Bulan dihitung dari TANGGALNYA, bukan dijumlahkan dari minggu ──
//
// Minggu kerja melintasi pergantian bulan: minggu 27 Juli–2 Agustus
// menyumbang hari ke DUA bulan berbeda. Menjumlahkan rekap mingguan akan
// menaruh seluruh minggu itu di salah satu bulan saja — dan yang membayar
// menemukan Agustus kelebihan beberapa hari yang tidak bisa dijelaskan.
{
  const laporan = [
    { tanggal: '2026-07-30', absensi: [hadir('p1', 'Ujang')] },
    { tanggal: '2026-07-31', absensi: [hadir('p1', 'Ujang')] },
    { tanggal: '2026-08-01', absensi: [hadir('p1', 'Ujang')] },
    { tanggal: '2026-08-03', absensi: [hadir('p1', 'Ujang')] },
  ]
  const bln = rekapUpahBulanan(laporan, pekerja)
  assert(bln.length === 2, 'dua bulan')
  assert(bln[0].bulan === '2026-08', 'terbaru lebih dulu — yang belum dibayar selalu yang terakhir')

  const juli = bln.find(b => b.bulan === '2026-07')
  const agu = bln.find(b => b.bulan === '2026-08')
  assert(juli.baris[0].hok === 2, 'Juli: 2 hari')
  assert(agu.baris[0].hok === 2, 'Agustus: 2 hari, tidak kebagian hari Juli')
  assert(juli.totalUpah === 300000, 'upah Juli = 2 × 150.000')
  assert(agu.totalUpah === 300000, 'upah Agustus dihitung terpisah')

  // Yang sama lewat jalur mingguan menaruh keempatnya di minggu yang berbeda.
  const mgg = rekapUpahMingguan(laporan, pekerja)
  assert(mgg.length >= 2, 'mingguan memang memecahnya lain — itu sebabnya keduanya ada')
}

// ── 2. Satu orang, satu tanggal, satu hitungan ───────────────────────
//
// Di proyek dengan dua pengawas, dua laporan untuk hari yang sama terjadi
// hampir setiap minggu. Tanpa penjagaan ini, orangnya dibayar dua kali.
{
  const laporan = [
    { tanggal: '2026-08-03', absensi: [hadir('p1', 'Ujang')] },
    { tanggal: '2026-08-03', absensi: [hadir('p1', 'Ujang')] },
  ]
  const b = rekapUpahBulanan(laporan, pekerja)[0]
  assert(b.baris[0].hok === 1, 'dua laporan hari sama tetap satu hari kerja')
  assert(b.totalUpah === 150000, 'dan satu kali upah')
  assert(b.hariKerja === 1, 'hari kalendernya juga satu')
}

// ── 3. Borongan: null, BUKAN nol ─────────────────────────────────────
//
// Nol berarti "bekerja tanpa dibayar" — tuduhan yang serius dan salah.
// Null berarti "tidak dibayar dengan cara ini".
{
  const b = rekapUpahBulanan(
    [{ tanggal: '2026-08-03', absensi: [hadir('p1', 'Ujang'), hadir('p2', 'Deden')] }], pekerja)[0]
  const deden = b.baris.find(r => r.nama === 'Deden')
  assert(deden.upah === null, 'borongan: null')
  assert(deden.upah !== 0, 'dan tegas bukan nol')
  assert(b.jumlahBorongan === 1, 'jumlahnya disebut supaya nol di kolom total ada penjelasannya')
  assert(b.totalUpah === 150000, 'borongan tidak ikut ke total yang dibayar harian')
}

// ── 4. Status selain hadir dihitung benar ────────────────────────────
{
  const laporan = [
    { tanggal: '2026-08-03', absensi: [hadir('p1', 'Ujang', 'hadir', 2)] },
    { tanggal: '2026-08-04', absensi: [hadir('p1', 'Ujang', 'setengah')] },
    { tanggal: '2026-08-05', absensi: [hadir('p1', 'Ujang', 'izin')] },
    { tanggal: '2026-08-06', absensi: [hadir('p1', 'Ujang', 'alpa')] },
  ]
  const r = rekapUpahBulanan(laporan, pekerja)[0].baris[0]
  assert(r.hadir === 1 && r.setengah === 1 && r.izin === 1 && r.alpa === 1, 'tiap status tercatat')
  assert(r.hok === 1.5, 'HOK: hadir 1 + setengah 0,5; izin & alpa tidak dibayar')
  assert(r.jamLembur === 2, 'lembur dijumlahkan terpisah, tidak dilebur ke HOK')
  assert(r.upah === 225000, '1,5 × 150.000')
}

// ── 5. Pekerja yang tidak terdaftar tetap masuk hitungan ─────────────
//
// Mandor sering mengetik nama orang yang belum sempat didaftarkan. Membuangnya
// berarti orang yang benar-benar bekerja tidak muncul di daftar gaji sama
// sekali — dan tidak ada yang menyadarinya sampai ia menagih.
{
  const b = rekapUpahBulanan(
    [{ tanggal: '2026-08-03', absensi: [{ nama: 'Asep', status: 'hadir' }] }], pekerja)[0]
  assert(b.baris.length === 1 && b.baris[0].nama === 'Asep', 'yang belum terdaftar tetap muncul')
  assert(b.baris[0].upahHarian === 0, 'tarifnya belum ada')
  assert(upahBelumDiisiBulan(b).length === 1, 'dan ditandai sebagai belum punya upah')
}

// ── 6. Peringatan SEBELUM dicetak ────────────────────────────────────
//
// Dicetak berarti dibawa ke orangnya dan dibayarkan. Angka nol yang diam jauh
// lebih berbahaya di atas kertas daripada di layar: di layar ia masih bisa
// diperbaiki, di kertas ia sudah menjadi jumlah yang diterima orang.
{
  const p = peringatanCetakUpah([{ nama: 'Asep' }, { nama: 'Budi' }])
  assert(/2 pekerja/.test(p), 'menyebut berapa orang')
  assert(/Asep/.test(p) && /Budi/.test(p), 'dan siapa saja')
  assert(/Rp 0/.test(p), 'serta akibatnya kalau tetap dicetak')
  assert(peringatanCetakUpah([]) === '', 'tidak ada masalah: tidak berbunyi')
  assert(peringatanCetakUpah(null) === '', 'kosong aman')
  assert(/…/.test(peringatanCetakUpah([{nama:'a'},{nama:'b'},{nama:'c'},{nama:'d'}])),
    'lebih dari tiga dipendekkan, bukan menumpahkan seluruh daftar ke satu kalimat')
}

// ── 7. Label bulan terbaca orang ─────────────────────────────────────
{
  assert(labelBulanUpah('2026-08') === 'Agustus 2026', 'bukan "2026-08"')
  assert(labelBulanUpah('2026-01') === 'Januari 2026', 'bulan pertama')
  assert(labelBulanUpah('2026-12') === 'Desember 2026', 'bulan terakhir')
  assert(labelBulanUpah('ngawur') === 'ngawur', 'yang tak terbaca dikembalikan apa adanya, bukan NaN')
  assert(!/undefined|NaN/.test(labelBulanUpah(null)), 'kosong aman')
}

// ── 8. Tanggal rusak tidak merusak seluruh rekap ─────────────────────
{
  const b = rekapUpahBulanan([
    { tanggal: '', absensi: [hadir('p1', 'Ujang')] },
    { tanggal: 'ngawur', absensi: [hadir('p1', 'Ujang')] },
    { tanggal: '2026-08-03', absensi: [hadir('p1', 'Ujang')] },
  ], pekerja)
  assert(b.length === 1 && b[0].baris[0].hok === 1, 'baris bertanggal rusak dilewati, sisanya utuh')
  assert(rekapUpahBulanan(null, null).length === 0, 'kosong aman')
  assert(rekapUpahBulanan([{ tanggal: '2026-08-03' }], pekerja).length === 0,
    'laporan tanpa absensi tidak membuat bulan kosong')
}

// ── 9. Buku laporan milik proyek mana ────────────────────────────────
//
// Inilah sebab "laporan Pak Soni hilang". Halaman menampilkan judul proyek
// yang sedang dibuka di kepala layar, lalu seluruh buku milik semua proyek di
// bawahnya tanpa satu pun penanda. Buku yang terlihat dianggap buku proyek
// ini; linknya dibagikan ke mandor; laporannya masuk ke proyek lain.
{
  const buku = [
    { id: 'a', project_name: 'Rumah Noble Cove' },
    { id: 'b', project_name: 'Ruko Pak Soni' },
    { id: 'c', project_name: '' },
  ]
  assert(bukuMilikProyek(buku[1], 'Ruko Pak Soni') === true, 'miliknya sendiri')
  assert(bukuMilikProyek(buku[0], 'Ruko Pak Soni') === false, 'milik proyek lain')
  assert(bukuMilikProyek(buku[0], '  rumah noble cove ') === true, 'beda huruf besar & spasi tetap sama')

  const k = kelompokkanBuku(buku, 'Ruko Pak Soni')
  assert(k.milikProyek.length === 2, 'buku proyek ini + buku lama tanpa nama proyek')
  assert(k.proyekLain.length === 1 && k.proyekLain[0].id === 'a', 'yang lain dipisah, BUKAN dibuang')
  assert(k.milikProyek.some(b => b.id === 'c'),
    'buku lama tanpa nama proyek ikut ke sini — membuangnya membuat satu-satunya '
    + 'buku yang dimiliki sebagian orang tampak seperti milik orang lain')

  const semua = kelompokkanBuku(buku, '')
  assert(semua.proyekLain.length === 0, 'tanpa proyek aktif: tidak ada yang "milik orang lain"')
}

// ── 10. Buku kedua untuk proyek yang sama ditolak ────────────────────
//
// Ia membelah laporannya ke dua tempat, dan yang membagikan link tidak punya
// cara mengetahui mana yang dipakai mandor. Rekap absensi lalu menghitung
// setengahnya, dan upah yang dibayar kurang tanpa ada yang tahu sebabnya.
{
  const buku = [{ id: 'a', project_name: 'Rumah Noble Cove' }]
  const dobel = bolehBuatBuku(buku, 'Rumah Noble Cove')
  assert(dobel.boleh === false, 'buku kedua ditolak')
  assert(/sudah punya/.test(dobel.alasan), 'alasannya jelas')
  assert(/Rumah Noble Cove/.test(dobel.alasan), 'menyebut proyeknya')

  assert(bolehBuatBuku(buku, 'Ruko Pak Soni').boleh === true, 'proyek lain: boleh')

  // Tanpa proyek aktif, buku lama dibuat bernama harfiah "Proyek" — nama yang
  // tidak cocok dengan proyek mana pun, sehingga bukunya melayang selamanya.
  const yatim = bolehBuatBuku(buku, '')
  assert(yatim.boleh === false, 'tanpa proyek aktif: ditolak')
  assert(/Daftar Proyek/.test(yatim.alasan), 'dan diberi jalan keluarnya')
}

// ── 11. "Kenapa hilang" dijawab terang-terangan ──────────────────────
//
// Layar kosong membuat yang membacanya menyangka datanya lenyap. Menyebutkan
// bahwa buku yang terlihat milik proyek lain adalah jawaban atas pertanyaan
// yang sedang ia pikirkan.
{
  const p = pesanBelumPunyaBuku('Ruko Pak Soni', 2)
  assert(/Ruko Pak Soni/.test(p), 'menyebut proyeknya')
  assert(/proyek lain/.test(p), 'dan menjelaskan buku yang terlihat di bawah')
  assert(/bukan ke sini/.test(p), 'serta akibatnya kalau linknya dibagikan')

  const sendiri = pesanBelumPunyaBuku('Ruko Pak Soni', 0)
  assert(/Buat Buku Laporan/.test(sendiri), 'tanpa buku lain: cukup ajakan membuat')
  assert(!/proyek lain/.test(sendiri), 'tidak menyebut hal yang tidak ada di layar')
}

// ── 12. Aturannya dijaga di sumbernya ────────────────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const baca = (rel) => readFileSync(join(akar, rel), 'utf8')

  // Halaman laporan wajib memisahkan buku menurut proyek. Tanpa ini, keluhan
  // "laporan Pak Soni hilang" kembali persis seperti semula.
  const tab = baca('components/cost/TabLaporanLapangan.tsx')
  assert(/kelompokkanBuku\(/.test(tab), 'buku dipisah menurut proyek')
  assert(/bolehBuatBuku\(/.test(tab), 'dan buku kedua untuk proyek yang sama ditolak')
  assert(!/createLog\(projectInfo\?\.projectName \|\| 'Proyek'/.test(tab),
    'buku tidak lagi bisa lahir bernama harfiah "Proyek" — nama yang tidak '
    + 'cocok dengan proyek mana pun, sehingga bukunya melayang selamanya')

  // Daftar upah harus bisa dicetak berikut absensinya.
  const panel = baca('components/cost/PanelRekapAbsensi.tsx')
  assert(/unduhUpahPdf\(/.test(panel), 'ada tombol cetak daftar upah')
  assert(/rincian/.test(panel), 'dan absensinya ikut dilampirkan')
  assert(/rekapUpahBulanan/.test(panel), 'rekap bulanan tersedia, bukan hanya mingguan')

  const pdf = baca('lib/upahPdf.ts')
  assert(/Tanda Tangan/.test(pdf),
    'daftar upah punya kolom tanda tangan — tanpa itu ia hitungan, bukan bukti bayar')
}

console.log(`upah-bulanan: ${ok} assert lulus`)
