// Test penerimaan barang (DO) & pembayaran PO: berapa yang sudah datang,
// berapa yang sudah dibayar, dan kapan jatuh temponya.
import {
  ringkasTerima, statusTerima, doMilikPo,
  bayarMilikPo, totalDibayar, sisaTagihan, statusBayar,
  tanggalNotaAwal, jatuhTempo, ringkasTagihan, ringkasHutang,
  teksTempo, nomorDo,
  LABEL_STATUS_TERIMA, LABEL_STATUS_BAYAR, LABEL_STATUS_TAGIHAN, LABEL_METODE,
} from '../src/lib/penerimaan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const HARI_INI = new Date('2026-07-27T09:00:00Z')

const poItems = [
  { nama: 'Semen Portland', satuan: 'sak', qty: 100, harga: 65_000, subtotal: 6_500_000 },
  { nama: 'Besi D13', satuan: 'btg', qty: 50, harga: 120_000, subtotal: 6_000_000 },
]
const PO = {
  id: 'po1', nomor: 'PO/001/07/2026', total: 12_500_000,
  term: 'term', term_hari: 30, status: 'terkirim', items: poItems,
}
const doBaru = (o) => ({
  id: 'd1', po_id: 'po1', nomor_do: 'SJ-1', nomor_nota: 'INV-1',
  tanggal_nota: '2026-07-01', tanggal_terima: '2026-07-01',
  penerima: 'Budi', items: [], catatan: '', foto: [], ...o,
})

// ── ringkasTerima & statusTerima ───────────────────────────────────────────
assert(statusTerima(poItems, []) === 'belum', 'tanpa DO berarti belum datang')
assert(statusTerima(poItems, null) === 'belum', 'dos null aman')
assert(statusTerima([], []) === 'belum', 'PO tanpa barang tidak pernah "lengkap"')

const sebagian = [doBaru({ items: [{ nama: 'Semen Portland', satuan: 'sak', qty: 40 }] })]
assert(statusTerima(poItems, sebagian) === 'sebagian', 'sebagian datang')
const r1 = ringkasTerima(poItems, sebagian)
assert(r1[0].diterima === 40 && r1[0].kurang === 60, 'semen: 40 datang, kurang 60')
assert(r1[1].diterima === 0 && r1[1].kurang === 50, 'besi belum datang sama sekali')

// Nama pada DO diketik ulang / dibaca AI, jadi hampir tidak pernah sama persis.
const bedaTulisan = [doBaru({ items: [
  { nama: '  semen   portland ', satuan: 'sak', qty: 100 },
  { nama: 'BESI D13', satuan: 'btg', qty: 50 },
] })]
assert(statusTerima(poItems, bedaTulisan) === 'lengkap',
  'beda huruf besar & spasi ganda tetap dikenali sebagai barang yang sama')

// Beberapa DO dijumlah.
const bertahap = [
  doBaru({ id: 'd1', items: [{ nama: 'Semen Portland', satuan: 'sak', qty: 60 }] }),
  doBaru({ id: 'd2', items: [{ nama: 'Semen Portland', satuan: 'sak', qty: 40 }] }),
  doBaru({ id: 'd3', items: [{ nama: 'Besi D13', satuan: 'btg', qty: 50 }] }),
]
assert(statusTerima(poItems, bertahap) === 'lengkap', 'kiriman bertahap dijumlah sampai lengkap')
assert(ringkasTerima(poItems, bertahap)[0].diterima === 100, 'qty dari beberapa DO dijumlah')

// Kelebihan kirim tidak menghasilkan kekurangan negatif.
const lebih = [doBaru({ items: [
  { nama: 'Semen Portland', satuan: 'sak', qty: 120 },
  { nama: 'Besi D13', satuan: 'btg', qty: 50 },
] })]
assert(ringkasTerima(poItems, lebih)[0].kurang === 0, 'kelebihan kirim tidak jadi kurang negatif')
assert(statusTerima(poItems, lebih) === 'lengkap', 'kelebihan kirim tetap lengkap')

// Masukan cacat tidak boleh merusak hitungan.
assert(ringkasTerima(poItems, [doBaru({ items: [{ nama: '', qty: 99 }] })])[0].diterima === 0,
  'baris DO tanpa nama diabaikan')
assert(ringkasTerima(poItems, [doBaru({ items: [{ nama: 'Semen Portland', qty: -5 }] })])[0].diterima === 0,
  'qty negatif diabaikan')
assert(ringkasTerima(poItems, [doBaru({ items: null })])[0].diterima === 0, 'DO tanpa items aman')

// ── doMilikPo ──────────────────────────────────────────────────────────────
const campur = [doBaru({ id: 'a' }), doBaru({ id: 'b', po_id: 'po2' })]
assert(doMilikPo('po1', campur).map(d => d.id).join(',') === 'a', 'hanya DO milik PO ini')
assert(doMilikPo('', campur).length === 0, 'tanpa id PO hasilnya kosong')
assert(doMilikPo('po1', null).length === 0, 'dos null aman')

// ── Pembayaran ─────────────────────────────────────────────────────────────
const bayar = (o) => ({
  id: 'b1', po_id: 'po1', tanggal: '2026-07-10', jumlah: 0,
  metode: 'transfer', referensi: '', bukti: null, catatan: '', ...o,
})

assert(statusBayar(PO, []) === 'belum', 'tanpa pembayaran = belum dibayar')
assert(totalDibayar('po1', []) === 0, 'total nol')
assert(sisaTagihan(PO, []) === 12_500_000, 'sisa = total PO')

const dp = [bayar({ jumlah: 5_000_000 })]
assert(statusBayar(PO, dp) === 'sebagian', 'DP = dibayar sebagian')
assert(sisaTagihan(PO, dp) === 7_500_000, 'sisa setelah DP')

const lunas = [bayar({ id: 'b1', jumlah: 5_000_000 }), bayar({ id: 'b2', jumlah: 7_500_000 })]
assert(statusBayar(PO, lunas) === 'lunas', 'DP + pelunasan = lunas')
assert(sisaTagihan(PO, lunas) === 0, 'tidak ada sisa')

assert(statusBayar(PO, [bayar({ jumlah: 99_000_000 })]) === 'lunas', 'terbayar lebih tetap lunas')
assert(sisaTagihan(PO, [bayar({ jumlah: 99_000_000 })]) === 0, 'terbayar lebih: sisa tidak negatif')
assert(totalDibayar('po1', [bayar({ jumlah: -100 })]) === 0, 'jumlah negatif diabaikan')
assert(statusBayar({ id: 'po0', total: 0 }, [bayar({ po_id: 'po0', jumlah: 1 })]) === 'lunas',
  'PO bernilai nol dengan pembayaran dianggap lunas')
assert(bayarMilikPo('po1', [bayar({ po_id: 'po2', jumlah: 1 })]).length === 0,
  'pembayaran PO lain tidak ikut terhitung')

// ── Jatuh tempo ────────────────────────────────────────────────────────────
assert(tanggalNotaAwal('po1', []) === null, 'tanpa DO belum ada tanggal nota')
assert(jatuhTempo(PO, []) === null, 'tanpa nota tidak ada jatuh tempo')

// Nota PALING AWAL yang dipakai, supaya tagihan pertama yang menentukan.
const duaNota = [
  doBaru({ id: 'd1', tanggal_nota: '2026-07-20' }),
  doBaru({ id: 'd2', tanggal_nota: '2026-07-05' }),
]
assert(tanggalNotaAwal('po1', duaNota) === '2026-07-05', 'nota paling awal yang dipakai')
assert(jatuhTempo(PO, duaNota) === '2026-08-04', 'tempo 30 hari dari nota paling awal')

assert(jatuhTempo({ ...PO, term: 'cash', term_hari: 0 }, duaNota) === '2026-07-05',
  'cash jatuh tempo pada hari notanya juga')
assert(jatuhTempo({ ...PO, term: 'cash', term_hari: 30 }, duaNota) === '2026-07-05',
  'term_hari diabaikan bila cash')
assert(jatuhTempo({ ...PO, term_hari: -5 }, duaNota) === '2026-07-05', 'term_hari negatif dianggap nol')

// DO tanpa tanggal nota (vendor belum menyerahkan) tidak memulai tempo.
assert(tanggalNotaAwal('po1', [doBaru({ tanggal_nota: null })]) === null, 'nota kosong diabaikan')
assert(tanggalNotaAwal('po1', [doBaru({ tanggal_nota: 'bukan-tanggal' })]) === null, 'tanggal cacat diabaikan')
assert(tanggalNotaAwal('po1', [
  doBaru({ id: 'd1', tanggal_nota: null }),
  doBaru({ id: 'd2', tanggal_nota: '2026-07-09' }),
]) === '2026-07-09', 'nota yang ada tetap dipakai walau ada yang kosong')

// ── ringkasTagihan ─────────────────────────────────────────────────────────
const belumDatang = ringkasTagihan(PO, [], [], HARI_INI)
assert(belumDatang.statusTagihan === 'belum_tertagih', 'barang belum datang = belum tertagih')
assert(belumDatang.hariLagi === null, 'belum tertagih tidak punya hitungan hari')

// Nota 2026-07-01 + 30 hari = 2026-07-31, hari ini 2026-07-27 → 4 hari lagi.
const akanTempo = ringkasTagihan(PO, [doBaru({ tanggal_nota: '2026-07-01' })], [], HARI_INI)
assert(akanTempo.jatuhTempo === '2026-07-31', 'jatuh tempo dihitung benar')
assert(akanTempo.hariLagi === 4, 'sisa 4 hari')
assert(akanTempo.statusTagihan === 'akan_jatuh_tempo', 'belum jatuh tempo')

// Nota 2026-06-27 + 30 = 2026-07-27 = hari ini.
const hariIniTempo = ringkasTagihan(PO, [doBaru({ tanggal_nota: '2026-06-27' })], [], HARI_INI)
assert(hariIniTempo.hariLagi === 0, 'tepat hari ini')
assert(hariIniTempo.statusTagihan === 'jatuh_tempo_hari_ini', 'jatuh tempo hari ini')

// Nota 2026-06-01 + 30 = 2026-07-01, sudah lewat 26 hari.
const telat = ringkasTagihan(PO, [doBaru({ tanggal_nota: '2026-06-01' })], [], HARI_INI)
assert(telat.hariLagi === -26, 'sudah telat 26 hari')
assert(telat.statusTagihan === 'terlambat', 'lewat tempo')
assert(teksTempo(telat.hariLagi) === 'Telat 26 hari', 'teks telat')

// Lunas mengalahkan semua status tempo — yang sudah dibayar tidak "terlambat".
const telatTapiLunas = ringkasTagihan(PO, [doBaru({ tanggal_nota: '2026-06-01' })], lunas, HARI_INI)
assert(telatTapiLunas.statusTagihan === 'lunas', 'sudah lunas tidak lagi disebut terlambat')
assert(telatTapiLunas.sisa === 0, 'sisa nol')

// Dibayar sebagian tetap bisa terlambat.
const telatSebagian = ringkasTagihan(PO, [doBaru({ tanggal_nota: '2026-06-01' })], dp, HARI_INI)
assert(telatSebagian.statusTagihan === 'terlambat', 'baru DP tetap terlambat')
assert(telatSebagian.sisa === 7_500_000, 'sisa setelah DP')

// ── ringkasHutang ──────────────────────────────────────────────────────────
const POS = [
  { ...PO, id: 'p-telat', total: 10_000_000, status: 'terkirim' },
  { ...PO, id: 'p-besok', total: 20_000_000, status: 'terkirim' },
  { ...PO, id: 'p-draft', total: 99_000_000, status: 'draft' },
  { ...PO, id: 'p-tolak', total: 88_000_000, status: 'ditolak' },
  { ...PO, id: 'p-lunas', total: 5_000_000, status: 'selesai' },
]
const DOS = [
  doBaru({ id: 'x1', po_id: 'p-telat', tanggal_nota: '2026-06-01' }),
  doBaru({ id: 'x2', po_id: 'p-besok', tanggal_nota: '2026-06-28' }),   // tempo 2026-07-28
  doBaru({ id: 'x3', po_id: 'p-lunas', tanggal_nota: '2026-06-01' }),
]
const BAYAR = [bayar({ id: 'y1', po_id: 'p-lunas', jumlah: 5_000_000 })]
const h = ringkasHutang(POS, DOS, BAYAR, HARI_INI)

assert(h.baris.length === 3, 'PO draf & ditolak tidak punya kewajiban bayar')
assert(!h.baris.some(b => b.po.id === 'p-draft'), 'PO draf tidak masuk daftar hutang')
assert(h.baris[0].po.id === 'p-telat', 'yang terlambat diurutkan paling atas')
assert(h.baris[h.baris.length - 1].po.id === 'p-lunas', 'yang lunas diurutkan paling bawah')
assert(h.totalHutang === 30_000_000, 'total hutang hanya yang belum lunas')
assert(h.totalTerlambat === 10_000_000, 'total yang sudah lewat tempo')
assert(h.jumlahTerlambat === 1, 'satu PO terlambat')
assert(h.jumlahJatuhTempoHariIni === 0, 'tidak ada yang jatuh tempo hari ini')
assert(ringkasHutang([], [], []).totalHutang === 0, 'tanpa PO aman')
assert(ringkasHutang(null, null, null).baris.length === 0, 'semua null aman')

// ── teksTempo ──────────────────────────────────────────────────────────────
assert(teksTempo(null) === 'Belum tertagih', 'null')
assert(teksTempo(0) === 'Jatuh tempo hari ini', 'nol')
assert(teksTempo(5) === '5 hari lagi', 'positif')
assert(teksTempo(-1) === 'Telat 1 hari', 'negatif')

// ── nomorDo ────────────────────────────────────────────────────────────────
assert(nomorDo(0, HARI_INI) === 'DO/001/07/2026', 'DO pertama')
assert(nomorDo(11, HARI_INI) === 'DO/012/07/2026', 'nomor urut mengikuti jumlah')
assert(nomorDo(-3, HARI_INI) === 'DO/001/07/2026', 'jumlah negatif tetap mulai 001')

// ── Label ──────────────────────────────────────────────────────────────────
assert(LABEL_STATUS_TERIMA.sebagian === 'Datang Sebagian', 'label penerimaan')
assert(LABEL_STATUS_BAYAR.belum === 'Belum Dibayar', 'label pembayaran')
assert(LABEL_STATUS_TAGIHAN.terlambat === 'Lewat Tempo', 'label tagihan')
assert(LABEL_METODE.transfer === 'Transfer', 'label metode')

console.log(`✅ penerimaan: ${ok} assertion lolos`)
