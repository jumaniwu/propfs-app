// Test logika Modul Akuntan (laba rugi, inventori, neraca, opname).
import { hitungLabaRugi, hitungInventori, hitungNeraca, progresOpname } from '../src/lib/akuntan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const pemasukan = [
  { id: '1', tanggal: '2026-07-01', sumber: 'Modal awal', kategori: 'modal', jumlah: 100_000_000 },
  { id: '2', tanggal: '2026-07-10', sumber: 'Termin 1', kategori: 'termin', jumlah: 50_000_000 },
  { id: '3', tanggal: '2026-08-02', sumber: 'Unit A-1', kategori: 'penjualan', jumlah: 30_000_000 },
]
const pengeluaran = [
  { id: 'a', tipe: 'material', tanggal: '2026-07-05', keterangan: 'Beli semen', namaMaterial: 'Semen 50kg', volume: 100, satuan: 'sak', hargaSatuan: 60_000, kategori: 'bangunan', jumlah: 6_000_000, status: 'Dicatat' },
  { id: 'b', tipe: 'upah', tanggal: '2026-07-12', keterangan: 'Upah cor', kategori: 'bangunan', jumlah: 4_000_000, status: 'Dicatat' },
  { id: 'c', tipe: 'operasional', tanggal: '2026-08-01', keterangan: 'BBM', kategori: 'operasional', jumlah: 1_000_000, status: 'Dicatat' },
]

// Laba rugi
const lr = hitungLabaRugi(pemasukan, pengeluaran)
assert(lr.totalPemasukan === 180_000_000, 'total pemasukan')
assert(lr.totalPengeluaran === 11_000_000, 'total pengeluaran')
assert(lr.laba === 169_000_000, 'laba = pemasukan - pengeluaran')
assert(lr.perBulan.length === 2, 'dua bulan terdata')
assert(lr.perBulan[0].bulan === '2026-07' && lr.perBulan[0].laba === 140_000_000, 'laba Juli')
assert(lr.perBulan[1].laba === 29_000_000, 'laba Agustus')
assert(lr.pemasukanPerKategori.find(p => p.kategori === 'Modal Disetor')?.jumlah === 100_000_000, 'kategori modal')

// Inventori: 100 sak masuk @60rb, 40 terpakai → stok 60, nilai 3.6jt
const inv = hitungInventori(pengeluaran, [
  { id: 'x', tanggal: '2026-07-20', nama: 'semen 50KG', satuan: 'sak', qty: -40 },
])
assert(inv.length === 1, 'material tergabung case-insensitive')
assert(inv[0].masuk === 100 && inv[0].keluar === 40 && inv[0].stok === 60, 'stok = masuk - keluar')
assert(Math.round(inv[0].hargaRata) === 60_000, 'harga rata dari pembelian')
assert(Math.round(inv[0].nilai) === 3_600_000, 'nilai stok')

// Neraca: kas = 180jt - 11jt = 169jt; persediaan 3.6jt; modal 100jt
const nr = hitungNeraca(pemasukan, pengeluaran, inv)
assert(nr.kas === 169_000_000, 'kas')
assert(Math.round(nr.persediaan) === 3_600_000, 'persediaan')
assert(nr.modalDisetor === 100_000_000, 'modal disetor')
assert(nr.totalAset === nr.totalPasiva, 'neraca seimbang: aset = pasiva')
assert(nr.seimbang === true, 'flag seimbang')

// Opname
const pct = progresOpname([
  { uraian: 'Pasang bata', satuan: 'm2', vol_rencana: 100, vol_realisasi: 50 },
  { uraian: 'Plester', satuan: 'm2', vol_rencana: 100, vol_realisasi: 150 }, // over → dibatasi 100
])
assert(pct === 75, 'progres opname dibatasi 100% per item (' + pct + ')')
assert(progresOpname([]) === 0, 'opname kosong = 0')

console.log('akuntan:', ok, 'assert lulus')
