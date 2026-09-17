// ============================================================
// Laporan Excel yang diekspor sendiri harus bisa dibaca kembali.
//
// Pengeluaran satu proyek terhapus oleh satu ketukan pada "Reset", dan
// satu-satunya salinan yang tersisa adalah laporan Excel yang sempat diunduh.
// Mengetik ulang empat belas transaksi — tanggal, volume, harga satuan,
// supplier, nomor nota — bukan pekerjaan yang pantas diminta dari siapa pun
// untuk memperbaiki kesalahan satu ketukan.
//
// KENAPA TES INI DITULIS ULANG.
//
// Versi pertamanya merakit sheet-nya sendiri: header dan baris yang DIKIRA
// sama dengan keluaran tombol Excel. Ia lulus tiga puluh lima assert, lalu
// berkas yang sungguhan gagal seluruhnya — empat belas transaksi terbaca nol
// rupiah, karena laporan menulis angkanya berformat dan Excel menyerahkannya
// kembali sebagai "5,520,000", dengan koma. Sheet karangan sendiri hanya
// membuktikan bahwa karangan itu konsisten dengan dirinya.
//
// Sekarang berkasnya dibuat oleh susunWorkbookRealisasi — fungsi yang sama
// persis dengan yang dipanggil tombol Excel — ditulis menjadi bita .xlsx,
// lalu dibaca kembali dari bita itu.
// ============================================================
import { createRequire } from 'node:module'
import {
  bacaRealisasiDariSheet, kalimatImpor, bacaChecksum,
  angkaSel, tanggalSel, petakanKolom,
} from '../src/lib/imporRealisasiExcel.ts'
import { susunWorkbookRealisasi, namaBerkasLaporan } from '../src/lib/laporanRealisasiExcel.ts'

const require_ = createRequire(import.meta.url)
const xlsx = require_('xlsx-js-style')

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 0. Pembacaan angka ──────────────────────────────────────────────
//
// Di sinilah kegagalannya bersarang. Pemisah ribuan tidak boleh ditebak dari
// jenis karakternya: laporan ini menulis "5,520,000" dengan koma, sementara
// orang yang sama menulis "1.750.000" dengan titik.
{
  assert(angkaSel(1750000) === 1750000, 'angka apa adanya')
  assert(angkaSel('Rp 1.750.000') === 1750000, '"Rp 1.750.000" terbaca penuh')
  assert(angkaSel('5,520,000') === 5520000, '"5,520,000" — koma sebagai ribuan, yang dulu jadi NaN')
  assert(angkaSel('35,710,000') === 35710000, 'nominal sebesar Noble Cove utuh')
  assert(angkaSel('1.750') === 1750, '"1.750" adalah seribu tujuh ratus lima puluh')
  assert(angkaSel('1,750') === 1750, '"1,750" juga seribu tujuh ratus lima puluh')
  assert(angkaSel('12,5') === 12.5, '"12,5" desimal gaya Indonesia')
  assert(angkaSel('12.5') === 12.5, '"12.5" desimal gaya Amerika')
  assert(angkaSel('1.234,56') === 1234.56, 'dua jenis pemisah — yang terakhir desimal')
  assert(angkaSel('1,234.56') === 1234.56, 'dua jenis pemisah, urutan terbalik')
  assert(angkaSel('(250.000)') === -250000, 'kurung akuntan berarti negatif')
  assert(angkaSel('') === 0 && angkaSel(null) === 0 && angkaSel('-') === 0, 'kosong & strip jadi nol')
  assert(angkaSel(Number.NaN) === 0, 'NaN tidak menular')
  assert(angkaSel('0.7%') === 0.7, 'persen di Rekap Kategori tidak jadi tujuh')
}

// ── 1. Tanggal ──────────────────────────────────────────────────────
{
  assert(tanggalSel('2026-08-25') === '2026-08-25', 'ISO apa adanya')
  assert(tanggalSel('25/08/2026') === '2026-08-25', 'dd/mm/yyyy urutan Indonesia')
  assert(tanggalSel('5/8/2026') === '2026-08-05', 'satu angka ikut dilengkapi')
  assert(tanggalSel('bukan tanggal') === '', 'yang tidak terbaca jadi kosong')
}

// ── 2. Berkas sungguhan: ekspor lalu baca kembali ───────────────────
//
// Empat belas transaksi, meniru bentuk Noble Cove: material dengan rincian
// nota, upah dengan hari kerja, dan operasional yang hanya ada di sheet
// "Semua Transaksi".
const asli = [
  {
    id: 'a1', tipe: 'material', tanggal: '2026-08-25', namaMaterial: 'Kawat Ikat',
    volume: 5, satuan: 'roll', hargaSatuan: 65000, jumlah: 325000,
    namaSupplier: 'PT. MATA AIR SOLO', nomorNota: '3755/CR/MAS/08/2026',
    kategori: 'bangunan', metodePembayaran: 'Transfer', status: 'Dicatat',
    keterangan: 'Kawat ikat penulangan Perumahan',
  },
  {
    id: 'a2', tipe: 'material', tanggal: '2026-08-27', namaMaterial: 'Paku Beton 3"',
    volume: 1, satuan: 'BOX', hargaSatuan: 16000, jumlah: 16000,
    namaSupplier: 'GLOBAL BANGUNAN SERAYA', nomorNota: '00975/CR/GBS/08/2026',
    kategori: 'bangunan', metodePembayaran: 'Cash', status: 'Dicatat',
    keterangan: 'Merek HEXZA @20box/dus',
  },
  {
    id: 'a3', tipe: 'material', tanggal: '2026-08-30', namaMaterial: 'Ring & Cincin',
    volume: 4, satuan: 'Pcs', hargaSatuan: 23000, jumlah: 92000,
    namaSupplier: 'Toko Sumber Alam', kategori: 'bangunan', status: 'Dicatat',
    keterangan: 'Pembelian alat kerja Noble Cove',
  },
  {
    id: 'a4', tipe: 'material', tanggal: '2026-09-01', namaMaterial: 'Semen Portland 50kg',
    volume: 120, satuan: 'sak', hargaSatuan: 58000, jumlah: 6960000,
    namaSupplier: 'Toko Maju', nomorNota: 'B01', kategori: 'bangunan',
    metodePembayaran: 'Transfer', status: 'Dicatat', keterangan: 'Semen untuk cor lantai 1',
  },
  {
    id: 'a5', tipe: 'material', tanggal: '2026-09-03', namaMaterial: 'Besi Beton 10mm',
    volume: 200, satuan: 'batang', hargaSatuan: 62000, jumlah: 12400000,
    namaSupplier: 'PT. MATA AIR SOLO', nomorNota: '3801/CR/MAS/09/2026',
    kategori: 'bangunan', metodePembayaran: 'Transfer', status: 'Dicatat',
    keterangan: 'Besi tulangan kolom',
  },
  {
    id: 'a6', tipe: 'upah', tanggal: '2026-09-12', namaTukang: 'Upah Pekerja Noble Cove',
    jenisKerja: 'Cor beton kolom lt.1', jumlahOrang: 4, hariKerja: 8, upahHarian: 172500,
    jumlah: 5520000, kategori: 'bangunan', metodePembayaran: 'Cash', status: 'Dicatat',
    keterangan: 'Pembayaran upah proyek minggu kedua',
  },
  {
    id: 'a7', tipe: 'upah', tanggal: '2026-09-05', namaTukang: 'Mandor Alpin',
    jenisKerja: 'Pasang bata', jumlahOrang: 3, hariKerja: 6, upahHarian: 150000,
    jumlah: 2700000, kategori: 'bangunan', status: 'Dicatat', keterangan: 'Pasang bata lt.1',
  },
  {
    id: 'a8', tipe: 'operasional', tanggal: '2026-09-02', jumlah: 450000,
    kategori: 'operasional', status: 'Dicatat', keterangan: 'Sewa molen 3 hari',
  },
  {
    id: 'a9', tipe: 'operasional', tanggal: '2026-09-04', jumlah: 250000,
    kategori: 'operasional', status: 'Kasbon', keterangan: 'Solar genset',
  },
  {
    id: 'a10', tipe: 'lainnya', tanggal: '2026-09-06', jumlah: 1750000,
    kategori: 'lainnya', status: 'Dicatat', keterangan: 'Konsumsi tukang sebulan',
  },
  {
    id: 'a11', tipe: 'material', tanggal: '2026-09-08', namaMaterial: 'Pasir Beton',
    volume: 12, satuan: 'm3', hargaSatuan: 285000, jumlah: 3420000,
    namaSupplier: 'CV Sumber Pasir', kategori: 'bangunan', status: 'Dicatat',
    keterangan: 'Pasir cor',
  },
  {
    id: 'a12', tipe: 'material', tanggal: '2026-09-09', namaMaterial: 'Batu Split',
    volume: 10, satuan: 'm3', hargaSatuan: 310000, jumlah: 3100000,
    namaSupplier: 'CV Sumber Pasir', kategori: 'bangunan', status: 'Dicatat',
    keterangan: 'Split cor',
  },
  {
    id: 'a13', tipe: 'upah', tanggal: '2026-09-10', namaTukang: 'Tukang Listrik',
    jenisKerja: 'Instalasi titik lampu', jumlahOrang: 2, hariKerja: 4, upahHarian: 200000,
    jumlah: 1600000, kategori: 'bangunan', status: 'Dicatat', keterangan: 'Instalasi listrik',
  },
  {
    id: 'a14', tipe: 'lainnya', tanggal: '2026-09-11', jumlah: 125000,
    kategori: 'lainnya', status: 'Dicatat', keterangan: 'Fotokopi gambar kerja',
  },
]
const totalAsli = asli.reduce((s, e) => s + e.jumlah, 0)

/** Ekspor sungguhan → bita .xlsx → baca kembali sebagai larik baris. */
function bolakBalik(entri) {
  const wb = susunWorkbookRealisasi(entri, {
    namaProyek: 'Rumah Noble Cove', dicetak: '16 September 2026',
  })
  const bita = xlsx.write(wb, { bookType: 'xlsx', type: 'array' })
  const wb2 = xlsx.read(bita, { type: 'array' })
  const sheets = {}
  for (const nama of wb2.SheetNames) {
    sheets[nama] = xlsx.utils.sheet_to_json(wb2.Sheets[nama], {
      header: 1, raw: false, defval: '',
    })
  }
  return sheets
}

const sheets = bolakBalik(asli)

// Bentuk berkasnya harus memang seperti yang diduga pembacanya.
{
  assert(sheets['Ringkasan'], 'sheet Ringkasan ada')
  assert(sheets['Rekap Kategori'], 'sheet Rekap Kategori ada')
  assert(sheets['Pembelian Material'], 'sheet Pembelian Material ada')
  assert(sheets['Upah Tukang'], 'sheet Upah Tukang ada')
  assert(sheets['Semua Transaksi'], 'sheet Semua Transaksi ada')
  // Inilah bentuk yang dulu tidak pernah terlihat: angkanya BERFORMAT.
  const rata = sheets['Semua Transaksi'].flat().map(String)
  assert(rata.some(v => /^[\d.,]+$/.test(v) && v.includes(',')),
    'angka di berkas memang ditulis dengan pemisah — bukan angka telanjang')
}

// ── 3. Pembacaan ulang harus mengembalikan semuanya ─────────────────
const hasil = bacaRealisasiDariSheet(sheets)
{
  assert(hasil.entri.length === 14, `14 transaksi kembali, bukan ${hasil.entri.length}`)
  assert(hasil.totalRupiah === totalAsli,
    `total utuh Rp ${totalAsli} — terbaca Rp ${hasil.totalRupiah}`)
  assert(hasil.dilewati.length === 0, 'tidak ada yang dilewati pada berkas yang bersih')

  // Justru inilah gejala yang dilaporkan: semuanya nol, semuanya dilewati.
  assert(hasil.entri.every(e => e.jumlah > 0), 'tidak ada satu pun yang terbaca nol')

  const upah = hasil.entri.find(e => e.namaTukang === 'Upah Pekerja Noble Cove')
  assert(upah && upah.jumlah === 5520000, 'Rp 5.520.000 kembali utuh, tidak jadi 5')
  assert(upah.jumlahOrang === 4 && upah.hariKerja === 8 && upah.upahHarian === 172500,
    'rincian upah ikut kembali')
  assert(upah.jenisKerja === 'Cor beton kolom lt.1', 'jenis pekerjaan ikut kembali')

  const kawat = hasil.entri.find(e => e.namaMaterial === 'Kawat Ikat')
  assert(kawat.jumlah === 325000 && kawat.volume === 5 && kawat.satuan === 'roll',
    'rincian material ikut kembali')
  assert(kawat.hargaSatuan === 65000, 'harga satuan ikut kembali')
  assert(kawat.namaSupplier === 'PT. MATA AIR SOLO', 'supplier ikut kembali')
  assert(kawat.nomorNota === '3755/CR/MAS/08/2026', 'nomor nota ikut kembali')
  assert(kawat.tanggal === '2026-08-25', 'tanggal ikut kembali')

  // "-" ditulis ekspor untuk yang kosong; ia bukan nama.
  const ring = hasil.entri.find(e => e.namaMaterial === 'Ring & Cincin')
  assert(ring.nomorNota === undefined, '"-" pada nota berarti kosong, bukan nama')

  // Operasional hanya ada di "Semua Transaksi".
  const molen = hasil.entri.find(e => e.keterangan === 'Sewa molen 3 hari')
  assert(molen && molen.tipe === 'operasional' && molen.jumlah === 450000,
    'operasional terbaca dari sheet Semua Transaksi')
  const fotokopi = hasil.entri.find(e => e.keterangan === 'Fotokopi gambar kerja')
  assert(fotokopi && fotokopi.tipe === 'lainnya', 'tipe lainnya tidak dipaksa jadi operasional')

  // Material & upah TIDAK boleh terhitung dua kali.
  assert(hasil.entri.filter(e => e.namaMaterial === 'Kawat Ikat').length === 1,
    'material tidak tergandakan oleh sheet Semua Transaksi')
  assert(hasil.entri.filter(e => e.tipe === 'material').length === 7, '7 material')
  assert(hasil.entri.filter(e => e.tipe === 'upah').length === 3, '3 upah')
  assert(hasil.entri.filter(e => e.tipe === 'operasional').length === 2, '2 operasional')
  assert(hasil.entri.filter(e => e.tipe === 'lainnya').length === 2, '2 lainnya')

  // Id baru, bukan id lama: id lama punya nisan di cloud.
  assert(hasil.entri.every(e => e.id.startsWith('xls-')), 'semua id dibuat baru')
  assert(new Set(hasil.entri.map(e => e.id)).size === 14, 'id tidak ada yang kembar')
  assert(hasil.entri.every(e => !asli.some(a => a.id === e.id)), 'tidak memakai id lama')
}

// ── 4. Cross-cek antar sheet ────────────────────────────────────────
//
// Satu sheet saja tidak bisa membuktikan pembacaannya benar. Yang bisa
// adalah angka yang ditulis laporan tentang dirinya sendiri.
{
  const cs = bacaChecksum(sheets)
  assert(cs.jumlahTransaksi === 14, `Ringkasan menyebut 14 transaksi, terbaca ${cs.jumlahTransaksi}`)
  assert(cs.totalRupiah === totalAsli, 'Ringkasan menyebut total yang sama')
  assert(cs.sumber.length > 0, 'sumber checksum disebutkan')

  assert(hasil.periksa.cocok, 'pembacaan cocok dengan laporannya sendiri')
  assert(hasil.periksa.terbaca === 14, 'yang terbaca dihitung sebelum penyaringan')
  assert(hasil.periksa.terbacaRupiah === totalAsli, 'rupiah terbaca sama dengan total laporan')
  assert(/dicocokkan/i.test(kalimatImpor(hasil)), 'kalimatnya menyebut pencocokan')
}

// Kalau angkanya salah terbaca, cross-cek HARUS berteriak — inilah yang dulu
// tidak ada, sehingga "14 baris dilewati" terdengar seperti keterangan biasa.
{
  const rusak = JSON.parse(JSON.stringify(sheets))
  const st = rusak['Semua Transaksi']
  const barisData = st.findIndex(b => String(b[2] ?? '').toLowerCase() === 'operasional')
  assert(barisData > 0, 'baris operasional ketemu untuk dirusak')
  st[barisData][5] = '0'
  const h = bacaRealisasiDariSheet(rusak)
  assert(!h.periksa.cocok, 'selisih terhadap Ringkasan ketahuan')
  assert(/tidak cocok/i.test(kalimatImpor(h)), 'kalimatnya menyebut ketidakcocokan')
  assert(/laporan menyebut/.test(h.periksa.selisih ?? ''), 'selisihnya disebutkan angkanya')
}

// Berkas yang seluruh angkanya nol — persis gejala yang dilaporkan — harus
// dijelaskan sebagai pembacaan yang gagal, bukan sekadar "baris dilewati".
{
  const nol = JSON.parse(JSON.stringify(sheets))
  for (const nama of ['Pembelian Material', 'Upah Tukang', 'Semua Transaksi']) {
    const b = nol[nama]
    const kepala = b.findIndex(r => r.some(x => String(x).toLowerCase().includes('tanggal')))
    for (let i = kepala + 1; i < b.length; i++) {
      b[i] = b[i].map(v => (/^[\d.,]+$/.test(String(v))
        && Number(String(v).replace(/[.,]/g, '')) > 1000 ? '0' : v))
    }
  }
  const h = bacaRealisasiDariSheet(nol)
  const kal = kalimatImpor(h)
  assert(h.entri.length === 0, 'tidak ada yang masuk dari berkas bernilai nol')
  assert(/nol/.test(kal), 'kalimatnya menyebut nilainya nol')
  assert(/tidak cocok/i.test(kal), 'kalimatnya menyebut tidak cocok dengan laporan')
  assert(/jangan dipakai/i.test(kal), 'kalimatnya menyuruh berhenti, bukan meyakinkan')
}

// ── 5. Impor kedua tidak menggandakan uang ──────────────────────────
{
  const kedua = bacaRealisasiDariSheet(sheets, hasil.entri)
  assert(kedua.entri.length === 0, 'berkas yang sama tidak menambah apa pun')
  assert(kedua.dilewati.length === 14, 'semuanya dikenali sudah ada')
  assert(kedua.periksa.cocok, 'pencocokan tetap lulus walau tidak ada yang masuk')
  assert(/sudah ada/i.test(kalimatImpor(kedua)), 'sebabnya disebut: sudah ada, bukan nol')

  // Sebagian sudah ada: sisanya tetap masuk.
  const sebagian = bacaRealisasiDariSheet(sheets, hasil.entri.slice(0, 11))
  assert(sebagian.entri.length === 3, `3 sisanya masuk, bukan ${sebagian.entri.length}`)
}

// ── 6. Berkas tanpa sheet rinci ─────────────────────────────────────
//
// Sheet Material & Upah hanya dibuat bila ada isinya. Pembacanya harus tahan.
{
  const hanyaLain = [
    { id: 'b1', tipe: 'operasional', tanggal: '2026-09-02', jumlah: 450000,
      kategori: 'operasional', status: 'Dicatat', keterangan: 'Sewa molen' },
  ]
  const s2 = bolakBalik(hanyaLain)
  assert(!s2['Pembelian Material'], 'sheet material memang tidak dibuat')
  const h = bacaRealisasiDariSheet(s2)
  assert(h.entri.length === 1 && h.entri[0].jumlah === 450000, 'tetap terbaca tanpa sheet rinci')
  assert(h.periksa.cocok, 'checksum tetap cocok')
}

// ── 7. Baris TOTAL bukan transaksi ──────────────────────────────────
{
  const { data } = petakanKolom(sheets['Pembelian Material'], ['tanggal', 'total'])
  assert(data.length === 7, `7 baris material tanpa baris TOTAL, bukan ${data.length}`)
  assert(!data.some(b => String(b[0]).toUpperCase() === 'TOTAL'), 'baris TOTAL dibuang')
}

// ── 8. Berkas asing ─────────────────────────────────────────────────
{
  const h = bacaRealisasiDariSheet({ 'Sheet1': [['nama', 'alamat'], ['Budi', 'Solo']] })
  assert(h.entri.length === 0, 'berkas yang bukan laporan tidak menghasilkan apa-apa')
  assert(!/tidak cocok/i.test(kalimatImpor(h)), 'tanpa checksum tidak menuduh tidak cocok')
  assert(bacaRealisasiDariSheet(null).entri.length === 0, 'null tidak meledak')
  assert(bacaRealisasiDariSheet({}).entri.length === 0, 'kosong tidak meledak')
}

// ── 9. Nama berkas ──────────────────────────────────────────────────
{
  const n = namaBerkasLaporan('Rumah Noble Cove', new Date('2026-09-16T00:00:00Z'))
  assert(n.startsWith('Laporan_Realisasi_Rumah_Noble_Cove_'), 'nama proyek masuk ke nama berkas')
  assert(n.endsWith('.xlsx'), 'berakhiran .xlsx')
  assert(!/[/\\:*?"<>|]/.test(n), 'tidak ada karakter yang ditolak sistem berkas')
}

console.log(`impor-realisasi-excel: ${ok} assert lulus`)
