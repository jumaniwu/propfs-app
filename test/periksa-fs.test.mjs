// ============================================================
// Kenapa seluruh angka FS berbunyi nol.
//
// Diaudit dengan menjalankan kalkulatornya sendiri atas data yang bentuknya
// seperti proyek sungguhan. Dengan JADWAL PENJUALAN KOSONG:
//
//     pendapatan       Rp 0
//     biaya bangun     Rp 0      ← ikut nol
//
// dan dengan jadwal yang sama diisi:
//
//     pendapatan       Rp 51.332.687.500
//     biaya bangun     Rp 24.753.750.000
//
// Sebabnya: `calcTotalBiayaBangun` menjumlahkan `biayaPerUnit × unitTerjual`,
// dan `calcPenerimaanDetail` juga bersandar pada `unitTerjual`. Keduanya
// membaca jadwal penjualan; ketika jadwal itu kosong seluruh laporan runtuh
// menjadi nol — TANPA satu pun keterangan.
//
// Yang paling merugikan bukan nolnya melainkan diamnya: angka yang tersisa
// (persiapan + operasional) terlihat cukup masuk akal sebagai "total
// investasi", sehingga tidak ada yang curiga seluruh anggaran pembangunan
// tidak ikut terhitung.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  periksaFS, totalDijadwalkan, totalUnitDibangun, selisihJadwal,
} from '../src/lib/periksaFS.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const K = (o) => periksaFS({
  jumlahTipe: 3, totalUnit: 120, unitDijadwalkan: 120,
  grossRevenue: 51_000_000_000, totalInvestment: 24_000_000_000, ...o,
})

// ── 1. Sebab disebut dari yang PALING AWAL ──────────────────────────
//
// Menyebut sebab yang paling akhir lebih dulu mengirim orang memperbaiki hal
// yang tidak salah.
{
  assert(/tipe bangunan/i.test(K({ jumlahTipe: 0 }).pesan), 'tanpa tipe: itu yang disebut')
  assert(/Step 3/.test(K({ jumlahTipe: 0 }).langkah), 'dan ke mana perginya')

  assert(/jumlah unitnya masih nol/i.test(K({ totalUnit: 0 }).pesan), 'tipe ada, unit nol')
  assert(/Step 3/.test(K({ totalUnit: 0 }).langkah), 'juga Step 3')

  // Tipe ada, unit ada, tetapi belum dijadwalkan terjual — keadaan pemakai.
  const jadwal = K({ unitDijadwalkan: 0, grossRevenue: 0 })
  assert(/dijadwalkan terjual/i.test(jadwal.pesan), 'menyebut jadwal penjualan')
  assert(/Simulasi Penjualan/i.test(jadwal.langkah), 'dan layar yang harus dibuka')

  const harga = K({ grossRevenue: 0 })
  assert(/harga jual/i.test(harga.pesan), 'sudah dijadwalkan tapi harga nol')
  assert(/Step 5/.test(harga.langkah), 'margin ada di Step 5')
}

// ── 2. Biaya bangun yang ikut nol DIKATAKAN ────────────────────────
//
// Inilah bagian yang selama ini hilang tanpa disadari. Nol di pendapatan
// masih terlihat; nol di biaya bangun tidak — ia tersamar di dalam total
// investasi yang angkanya tetap tampak masuk akal.
{
  const p = K({ unitDijadwalkan: 0, grossRevenue: 0 }).pesan
  assert(/biaya pembangunan/i.test(p), 'menyebut biaya pembangunan secara khusus')
  assert(/JUGA belum ikut terhitung/i.test(p), 'dan bahwa ia ikut hilang')
  assert(/persiapan dan operasional/i.test(p),
    'serta menerangkan angka apa yang sebenarnya tampil sebagai total investasi')
}

// ── 3. Yang lengkap tidak diganggu ────────────────────────────────
{
  const baik = K({})
  assert(baik.bermasalah === false, 'semuanya terisi: tidak ada peringatan')
  assert(baik.pesan === '' && baik.langkah === '', 'dan tidak berisik')
}

// ── 4. Hitungan unit ──────────────────────────────────────────────
{
  assert(totalUnitDibangun([{ jumlahUnit: 60 }, { jumlahUnit: 40 }, { jumlahUnit: 20 }]) === 120, 'dijumlah')
  assert(totalUnitDibangun([{ jumlahUnit: -5 }, { jumlahUnit: 10 }]) === 10, 'negatif tidak mengurangi')
  assert(totalUnitDibangun(null) === 0, 'kosong aman')
  assert(totalUnitDibangun([{}]) === 0, 'tanpa jumlahUnit aman')

  assert(totalDijadwalkan([{ unitTerjual: 30 }, { unitTerjual: 30 }]) === 60, 'dijumlah')
  assert(totalDijadwalkan([{ unitTerjual: -9 }, { unitTerjual: 5 }]) === 5, 'baris cacat diabaikan')
  assert(totalDijadwalkan(null) === 0, 'kosong aman')
}

// ── 5. Jadwal yang jauh lebih kecil daripada yang dibangun ────────
//
// Bukan galat — pembangunan bertahap memang begitu. Tetapi karena biaya
// pembangunan dihitung dari unit TERJUAL, selisih besar berarti sebagian
// besar anggaran bangunan tidak masuk laporan.
{
  const s = selisihJadwal(120, 30)
  assert(/30 dari 120/.test(s), 'menyebut angkanya')
  assert(/25%/.test(s), 'dan persentasenya')
  assert(/dihitung dari unit terjual/i.test(s), 'serta sebabnya')

  assert(selisihJadwal(120, 120) === '', 'lengkap: diam')
  assert(selisihJadwal(120, 115) === '', 'selisih kecil (≥90%) tidak perlu diributkan')
  assert(selisihJadwal(120, 0) === '', 'nol ditangani periksaFS, bukan di sini — jangan dobel')
  assert(selisihJadwal(0, 0) === '', 'kosong aman')
  assert(selisihJadwal(null, null) === '', 'kosong aman')
}

// ── 6. Halaman hasil benar-benar menampilkannya ──────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const hal = readFileSync(join(akar, 'pages/ResultPage.tsx'), 'utf8')
  assert(/periksaFS\(/.test(hal), 'halaman hasil memeriksa keadaannya')
  assert(/data-periksa-fs/.test(hal), 'dan menampilkannya')
  assert(hal.indexOf('data-periksa-fs') < hal.indexOf('<KPICards'),
    'DI ATAS kartu angkanya — peringatan di bawah angka yang salah dibaca belakangan')
}

console.log(`periksa-fs: ${ok} assert lulus`)
