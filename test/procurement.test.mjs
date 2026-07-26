// Test modul Procurement: nilai PO, sisa yang belum dipesan, aturan kirim,
// dan perbandingan harga antar vendor.
import {
  nomorPo, hitungTotalPo, sisaQty, belumTerpesan, bolehKirimPo,
  statusPoSetelah, ringkasKatalog, hargaVendorUntuk, teksTerm,
  LABEL_STATUS_PO, LABEL_TERM,
} from '../src/lib/procurement.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── nomorPo ────────────────────────────────────────────────────────────────
const kini = new Date('2026-07-26T00:00:00Z')
assert(nomorPo(0, kini) === 'PO/001/07/2026', 'PO pertama bernomor 001')
assert(nomorPo(11, kini) === 'PO/012/07/2026', 'nomor urut mengikuti jumlah PO')
assert(nomorPo(-5, kini) === 'PO/001/07/2026', 'jumlah negatif tetap mulai dari 001')

// ── hitungTotalPo ──────────────────────────────────────────────────────────
const items = [
  { nama: 'Semen', satuan: 'sak', qty: 100, harga: 65_000, subtotal: 0 },
  { nama: 'Besi D13', satuan: 'btg', qty: 50, harga: 120_000, subtotal: 999 }, // subtotal salah
]
const t1 = hitungTotalPo(items, 0)
assert(t1.subtotal === 6_500_000 + 6_000_000, 'subtotal dijumlah dari qty x harga')
assert(t1.items[1].subtotal === 6_000_000, 'subtotal per baris dihitung ulang, tidak dipercaya dari masukan')
assert(t1.ppn === 0 && t1.total === t1.subtotal, 'tanpa PPN total = subtotal')

const t2 = hitungTotalPo(items, 11)
assert(t2.ppn === Math.round(12_500_000 * 0.11), 'PPN 11% dihitung dari subtotal')
assert(t2.total === t2.subtotal + t2.ppn, 'total = subtotal + PPN')

// pembulatan & masukan cacat
const t3 = hitungTotalPo([{ nama: 'X', satuan: '', qty: 3, harga: 33_333.33, subtotal: 0 }], 0)
assert(t3.subtotal === 100_000, 'subtotal dibulatkan ke rupiah utuh')
const t4 = hitungTotalPo([{ nama: 'X', satuan: '', qty: NaN, harga: 1000, subtotal: 0 }], 0)
assert(t4.subtotal === 0, 'qty tidak valid dihitung nol')
assert(hitungTotalPo([], 11).total === 0, 'PO tanpa barang bernilai nol')
assert(hitungTotalPo(items, -5).ppn === 0, 'PPN negatif diabaikan')

// ── sisaQty & belumTerpesan ────────────────────────────────────────────────
assert(sisaQty({ qty: 300, qty_dipesan: 100 }) === 200, 'sisa = qty - dipesan')
assert(sisaQty({ qty: 300 }) === 300, 'tanpa qty_dipesan berarti belum dipesan sama sekali')
assert(sisaQty({ qty: 300, qty_dipesan: 300 }) === 0, 'terpesan penuh sisanya nol')
assert(sisaQty({ qty: 300, qty_dipesan: 500 }) === 0, 'terpesan berlebih tidak menghasilkan sisa negatif')
assert(sisaQty({ qty: 300, qty_dipesan: -50 }) === 300, 'qty_dipesan negatif diperlakukan sebagai nol')

const daftar = [
  { id: 'a', status: 'disetujui', qty: 300, qty_dipesan: 0 },
  { id: 'b', status: 'disetujui', qty: 300, qty_dipesan: 120 },
  { id: 'c', status: 'disetujui', qty: 300, qty_dipesan: 300 },
  { id: 'd', status: 'menunggu', qty: 300, qty_dipesan: 0 },
  { id: 'e', status: 'ditolak', qty: 300, qty_dipesan: 0 },
  { id: 'f', status: 'dibeli', qty: 300, qty_dipesan: 300 },
]
const siap = belumTerpesan(daftar).map(r => r.id)
assert(siap.join(',') === 'a,b', 'hanya request disetujui yang masih bersisa yang bisa dipesan')
assert(!siap.includes('d'), 'yang masih menunggu approval tidak boleh dipesan')
assert(!siap.includes('e'), 'yang ditolak tidak boleh dipesan')
assert(belumTerpesan([]).length === 0, 'daftar kosong aman')

// ── bolehKirimPo ───────────────────────────────────────────────────────────
const poDasar = {
  items: [{ nama: 'Semen', satuan: 'sak', qty: 1, harga: 1, subtotal: 1 }],
  vendor_wa: '081234567890',
  pembuat_signature: null, approver_signature: null, status: 'draft',
}
assert(bolehKirimPo(poDasar).boleh === false, 'PO tanpa tanda tangan tidak boleh dikirim')
assert(/ditandatangani/i.test(bolehKirimPo(poDasar).alasan), 'alasannya menyebut tanda tangan pembuat')

const poTtd = { ...poDasar, pembuat_signature: 'data:x', status: 'menunggu_approval' }
assert(bolehKirimPo(poTtd).boleh === false, 'sudah ttd tapi belum disetujui tetap tidak boleh')
assert(/disetujui/i.test(bolehKirimPo(poTtd).alasan), 'alasannya menyebut persetujuan')

const poSiap = { ...poTtd, approver_signature: 'data:y', status: 'disetujui' }
assert(bolehKirimPo(poSiap).boleh === true, 'sudah ttd + disetujui boleh dikirim')

assert(bolehKirimPo({ ...poSiap, vendor_wa: '' }).boleh === false, 'tanpa nomor WA vendor tidak bisa dikirim')
assert(bolehKirimPo({ ...poSiap, items: [] }).boleh === false, 'PO tanpa barang tidak bisa dikirim')
assert(bolehKirimPo({ ...poSiap, status: 'terkirim' }).boleh === false, 'PO yang sudah terkirim tidak dikirim dua kali')
assert(bolehKirimPo({ ...poSiap, status: 'ditolak' }).boleh === false, 'PO yang ditolak tidak bisa dikirim')

// ── statusPoSetelah ────────────────────────────────────────────────────────
assert(statusPoSetelah({ pembuat_signature: null, approver_signature: null, status: 'draft' }) === 'draft',
  'belum ada tanda tangan = draft')
assert(statusPoSetelah({ pembuat_signature: 'a', approver_signature: null, status: 'draft' }) === 'menunggu_approval',
  'sudah ttd pembuat = menunggu approval')
assert(statusPoSetelah({ pembuat_signature: 'a', approver_signature: 'b', status: 'menunggu_approval' }) === 'disetujui',
  'ttd + approval = disetujui')
assert(statusPoSetelah({ pembuat_signature: 'a', approver_signature: 'b', status: 'terkirim' }) === 'terkirim',
  'status akhir tidak ditarik mundur')
assert(LABEL_STATUS_PO.menunggu_approval === 'Menunggu Approval', 'label status tersedia')

// ── teksTerm ───────────────────────────────────────────────────────────────
assert(teksTerm('cash', 0) === LABEL_TERM.cash, 'cash ditulis sebagai Cash / Tunai')
assert(teksTerm('term', 30) === 'Tempo 30 hari', 'tempo menyebut jumlah hari')
assert(teksTerm('term', 0) === 'Tempo', 'tempo tanpa hari tetap terbaca')

// ── ringkasKatalog ─────────────────────────────────────────────────────────
const vendors = [
  { id: 'v1', nama: 'PT Sumber Beton', term: 'term', term_hari: 30 },
  { id: 'v2', nama: 'CV Maju Jaya', term: 'cash', term_hari: 0 },
]
const vItems = [
  { id: '1', vendor_id: 'v1', nama: 'Semen Portland', satuan: 'sak', harga: 68_000, merek: 'A', min_order: 0, catatan: '' },
  { id: '2', vendor_id: 'v2', nama: '  semen portland ', satuan: 'sak', harga: 65_000, merek: 'B', min_order: 0, catatan: '' },
  { id: '3', vendor_id: 'v1', nama: 'Besi D13', satuan: 'btg', harga: 120_000, merek: '', min_order: 0, catatan: '' },
  { id: '4', vendor_id: 'v2', nama: 'Cat Tembok', satuan: 'kaleng', harga: 0, merek: '', min_order: 0, catatan: '' },
]
const katalog = ringkasKatalog(vItems, vendors)

assert(katalog.length === 3, 'nama yang sama dengan penulisan berbeda digabung jadi satu baris')
const semen = katalog.find(b => /semen/i.test(b.nama))
assert(semen.penawaran.length === 2, 'kedua vendor tercatat sebagai penawaran')
assert(semen.hargaTermurah === 65_000, 'harga termurah dikenali')
assert(semen.vendorTermurah === 'CV Maju Jaya', 'vendor termurah dikenali')
assert(semen.penawaran[0].harga === 65_000, 'penawaran diurutkan dari termurah')
assert(semen.penawaran[0].term === 'Cash / Tunai', 'term payment vendor ikut ditampilkan')
assert(semen.penawaran[1].term === 'Tempo 30 hari', 'term tempo ikut ditampilkan')

const cat = katalog.find(b => /cat/i.test(b.nama))
assert(cat.hargaTermurah === 0 && cat.vendorTermurah === '',
  'harga 0 (belum diisi vendor) tidak dianggap termurah')

assert(katalog[0].nama.localeCompare(katalog[1].nama, 'id') <= 0, 'katalog urut menurut nama')
assert(ringkasKatalog([], []).length === 0, 'katalog kosong aman')
assert(ringkasKatalog([{ id: 'x', vendor_id: 'v1', nama: '   ', satuan: '', harga: 1, merek: '', min_order: 0, catatan: '' }], vendors).length === 0,
  'barang tanpa nama diabaikan')

// vendor yang tidak ada di daftar tetap tampil dengan nama cadangan
const tanpaVendor = ringkasKatalog([vItems[0]], [])
assert(tanpaVendor[0].penawaran[0].vendor_nama === 'Vendor', 'vendor tak dikenal memakai nama cadangan')

// ── hargaVendorUntuk ───────────────────────────────────────────────────────
assert(hargaVendorUntuk(vItems, 'v2', 'Semen Portland') === 65_000, 'harga vendor terisi otomatis')
assert(hargaVendorUntuk(vItems, 'v2', 'SEMEN PORTLAND') === 65_000, 'pencocokan nama tidak peka huruf besar')
assert(hargaVendorUntuk(vItems, 'v1', 'Cat Tembok') === 0, 'vendor tidak menawarkan barang itu = 0')
assert(hargaVendorUntuk(vItems, 'v2', 'Cat Tembok') === 0, 'harga 0 dari vendor tetap 0 (harus diisi manual)')
assert(hargaVendorUntuk([], 'v1', 'Semen') === 0, 'tanpa katalog = 0')

console.log(`✅ procurement: ${ok} assertion lolos`)
