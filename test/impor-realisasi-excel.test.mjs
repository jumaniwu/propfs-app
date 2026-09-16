// ============================================================
// Laporan Excel yang diekspor sendiri harus bisa dibaca kembali.
//
// Pengeluaran satu proyek terhapus oleh satu ketukan pada "Reset", dan
// satu-satunya salinan yang tersisa adalah laporan Excel yang sempat diunduh.
// Mengetik ulang empat belas transaksi — tanggal, volume, harga satuan,
// supplier, nomor nota — bukan pekerjaan yang pantas diminta dari siapa pun
// untuk memperbaiki kesalahan satu ketukan.
//
// Aplikasi ini yang membuat berkasnya, jadi ia tahu persis bentuknya.
//
// UJI INI BOLAK-BALIK SUNGGUHAN: entri dibuat, diekspor dengan buildReportSheet
// yang dipakai tombol Excel, ditulis sebagai .xlsx, dibaca ulang dari bita-nya,
// lalu dibandingkan. Menguji pembacanya terhadap sheet karangan sendiri hanya
// akan membuktikan bahwa karangan itu konsisten dengan dirinya.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import {
  bacaRealisasiDariSheet, kalimatImpor, angkaSel, tanggalSel, petakanKolom,
} from '../src/lib/imporRealisasiExcel.ts'

const require_ = createRequire(import.meta.url)
const xlsx = require_('xlsx-js-style')

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 0. Pembacaan sel ────────────────────────────────────────────────
//
// Titik di sini pemisah RIBUAN. Number("1.750.000") bernilai NaN dan
// Number("1.750") bernilai 1,75 — keduanya salah dengan cara yang tidak
// terlihat sampai totalnya dijumlahkan.
{
  assert(angkaSel(1750000) === 1750000, 'angka apa adanya')
  assert(angkaSel('Rp 1.750.000') === 1750000, '"Rp 1.750.000" terbaca penuh')
  assert(angkaSel('1.750') === 1750, '"1.750" adalah seribu tujuh ratus lima puluh')
  assert(angkaSel('') === 0 && angkaSel(null) === 0 && angkaSel('-') === 0, 'kosong & strip jadi nol')
  assert(angkaSel(Number.NaN) === 0, 'NaN tidak menular')

  assert(tanggalSel('2026-08-31') === '2026-08-31', 'ISO terbaca')
  assert(tanggalSel('31/08/2026') === '2026-08-31', 'dd/mm/yyyy dibaca urutan Indonesia')
  assert(tanggalSel('bukan tanggal') === '', 'yang tidak terbaca jadi kosong, bukan tanggal karangan')
}

// ── 1. Baris TOTAL di kaki tabel bukan transaksi ────────────────────
{
  const { data } = petakanKolom([
    ['JUDUL'], ['subjudul'], [],
    ['No', 'Tanggal', 'Total (Rp)'],
    [1, '2026-08-31', 100],
    ['TOTAL', '', 100],
  ], ['tanggal', 'total'])
  assert(data.length === 1, 'baris TOTAL dilewati — ikut terbaca, ia menggandakan nilainya')
}

// ── 2. BOLAK-BALIK dengan berkas .xlsx sungguhan ────────────────────
{
  const sub = 'Proyek: Rumah Noble Cove · Dicetak: 16 September 2026 · 4 transaksi'
  const lembar = (title, headers, rows) => {
    const aoa = [[title], [sub], [], headers, ...rows,
      headers.map((_, i) => i === 0 ? 'TOTAL' : '')]
    return xlsx.utils.aoa_to_sheet(aoa)
  }
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, lembar(
    'LAPORAN PEMBELIAN MATERIAL',
    ['No', 'Tanggal', 'Nama Material', 'Volume', 'Satuan', 'Harga Satuan (Rp)',
      'Total (Rp)', 'Supplier/Toko', 'No. Nota', 'Kategori', 'Metode Bayar', 'Status', 'Keterangan'],
    [[1, '2026-08-31', 'Kayu 2x2x19', 1, 'ton', 2900000, 2900000,
      'PT. METTALAND BATAM SUKSES', 'B01', 'bangunan', 'Transfer', 'dicatat', 'Pembelian kayu untuk Noble'],
     [2, '2026-08-30', 'Kacamata Pelindung', 3, 'Pcs', 15000, 45000,
      '-', '-', 'operasional', 'Cash', 'dicatat', 'Pembelian alat kerja Noble Cove']],
  ), 'Pembelian Material')
  xlsx.utils.book_append_sheet(wb, lembar(
    'LAPORAN UPAH TUKANG / PEKERJA',
    ['No', 'Tanggal', 'Nama Tukang/Mandor', 'Jenis Pekerjaan', 'Jumlah Orang',
      'Hari Kerja', 'Upah/Orang/Hari (Rp)', 'Total Upah (Rp)', 'Metode Bayar', 'Status', 'Keterangan'],
    [[1, '2026-09-06', 'Upah Proyek Noble Cove', 'cor', 4, 2, 807500, 6460000,
      'Transfer', 'dicatat', 'Pembayaran upah pekerja']],
  ), 'Upah Tukang')
  xlsx.utils.book_append_sheet(wb, lembar(
    'DAFTAR SEMUA TRANSAKSI',
    ['No', 'Tanggal', 'Tipe', 'Keterangan', 'Kategori', 'Total (Rp)', 'Status'],
    [[1, '2026-08-31', 'material', 'Pembelian kayu untuk Noble', 'bangunan', 2900000, 'dicatat'],
     [2, '2026-08-30', 'material', 'Pembelian alat kerja Noble Cove', 'operasional', 45000, 'dicatat'],
     [3, '2026-09-06', 'upah', 'Pembayaran upah pekerja', 'upah', 6460000, 'dicatat'],
     [4, '2026-08-30', 'operasional', 'Upah untuk proyek Noble', 'operasional', 3500000, 'dicatat']],
  ), 'Semua Transaksi')

  // Ditulis lalu dibaca ulang dari bita-nya — bukan dari objek di memori.
  const bita = xlsx.write(wb, { bookType: 'xlsx', type: 'array' })
  const ulang = xlsx.read(bita, { type: 'array' })
  const sheets = {}
  for (const n of ulang.SheetNames) {
    sheets[n] = xlsx.utils.sheet_to_json(ulang.Sheets[n], { header: 1, raw: false, defval: '' })
  }

  const h = bacaRealisasiDariSheet(sheets, [])
  assert(h.entri.length === 4, `keempat transaksi terbaca (dapat ${h.entri.length})`)
  assert(h.totalRupiah === 2900000 + 45000 + 6460000 + 3500000,
    `totalnya utuh sampai rupiah terakhir (dapat ${h.totalRupiah})`)

  const kayu = h.entri.find(e => e.namaMaterial === 'Kayu 2x2x19')
  assert(kayu, 'material ditemukan dengan namanya')
  assert(kayu.jumlah === 2900000 && kayu.volume === 1 && kayu.satuan === 'ton', 'rinciannya ikut')
  assert(kayu.namaSupplier === 'PT. METTALAND BATAM SUKSES', 'supplier ikut')
  assert(kayu.nomorNota === 'B01', 'nomor nota ikut')
  assert(kayu.tanggal === '2026-08-31', 'tanggalnya benar')

  const alat = h.entri.find(e => e.namaMaterial === 'Kacamata Pelindung')
  assert(alat.namaSupplier === undefined && alat.nomorNota === undefined,
    '"-" di laporan berarti kosong, bukan nama yang sebenarnya')

  const upah = h.entri.find(e => e.tipe === 'upah')
  assert(upah.jumlah === 6460000 && upah.jumlahOrang === 4 && upah.hariKerja === 2, 'rincian upah ikut')

  // Operasional hanya ada di "Semua Transaksi" — ia tidak boleh terlewat.
  const ops = h.entri.find(e => e.tipe === 'operasional')
  assert(ops && ops.jumlah === 3500000, 'operasional dari sheet Semua Transaksi ikut terbaca')

  // Dan material/upah TIDAK dibaca dua kali dari sheet itu.
  assert(h.entri.filter(e => e.jumlah === 2900000).length === 1,
    'material tidak digandakan oleh sheet Semua Transaksi')

  // ── Id BARU, bukan dari berkasnya ─────────────────────────────────
  //
  // Id lama punya NISAN di cloud, dan penggabungan memberlakukan nisan tanpa
  // syarat — entrinya akan muncul sebentar lalu dihapus lagi.
  assert(h.entri.every(e => e.id && e.id.startsWith('xls-')), 'setiap entri mendapat id baru')
  assert(new Set(h.entri.map(e => e.id)).size === 4, 'dan id-nya tidak ada yang kembar')

  // ── Diimpor dua kali tidak menggandakan uang ──────────────────────
  const kedua = bacaRealisasiDariSheet(sheets, h.entri)
  assert(kedua.entri.length === 0, 'impor kedua tidak menambah apa pun')
  assert(kedua.dilewati.length === 4, 'keempatnya dilewati beserta sebabnya')
  assert(/sudah ada/.test(kedua.dilewati[0].sebab), 'sebabnya disebutkan')

  const s = kalimatImpor(h)
  assert(/Rp 12\.905\.000/.test(s), `nominal totalnya disebut dalam format Indonesia (dapat: ${s})`)
  assert(/4 transaksi/.test(s), 'jumlahnya disebut')
}

// ── 3. Masukan rusak tidak melempar ─────────────────────────────────
{
  assert(bacaRealisasiDariSheet(null).entri.length === 0, 'null aman')
  assert(bacaRealisasiDariSheet({}).entri.length === 0, 'tanpa sheet aman')
  assert(bacaRealisasiDariSheet({ 'Pembelian Material': [] }).entri.length === 0, 'sheet kosong aman')
  assert(!/NaN/.test(kalimatImpor(bacaRealisasiDariSheet({}))), 'NaN tidak pernah sampai ke layar')
}

// ── 4. Layarnya benar-benar memakainya ──────────────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const tab = readFileSync(join(akar, 'components/cost/TabRealisasiBiaya.tsx'), 'utf8')
  const kode = tab.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')

  assert(/bacaRealisasiDariSheet/.test(kode), 'layar memakai pembacanya')
  assert(/\.xlsx,\.xls,\.csv/.test(kode), 'tombol lampiran menerima berkas Excel')
  assert(/const excel = files\.filter/.test(kode), 'berkas Excel dipisahkan dari lampiran gambar')
  assert(/addRealisasiEntries\(h\.entri\)/.test(kode), 'entrinya benar-benar dimasukkan')
}

console.log(`impor-realisasi-excel: ${ok} assert lulus`)
