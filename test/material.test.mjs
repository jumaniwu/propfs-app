// Test ringkasan kekurangan material: rencana (Material Schedule) vs pemakaian
// lapangan vs request material.
import { ringkasKekurangan, stokLapangan, cariMaterial } from '../src/lib/materialApi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const rencana = [
  { id: 'm1', materialName: 'Semen Portland 50kg', estimatedVolume: 1000, unit: 'sak', estimatedUnitPrice: 60000, estimatedTotalCost: 60_000_000, linkedTasks: [] },
  { id: 'm2', materialName: 'Besi Beton D13', estimatedVolume: 500, unit: 'btg', estimatedUnitPrice: 120000, estimatedTotalCost: 60_000_000, linkedTasks: [] },
  { id: 'm3', materialName: 'Pasir Beton', estimatedVolume: 200, unit: 'm3', estimatedUnitPrice: 350000, estimatedTotalCost: 70_000_000, linkedTasks: [] },
]

const pemakaian = [
  { id: 'u1', nama: 'Semen Portland 50kg', satuan: 'sak', qty: 960, tanggal: '2026-07-20', pelapor: 'Yono', lokasi: '', catatan: '', photos: [], project_name: 'A', log_id: null },
  { id: 'u2', nama: 'Besi Beton D13', satuan: 'btg', qty: 550, tanggal: '2026-07-21', pelapor: 'Yono', lokasi: '', catatan: '', photos: [], project_name: 'A', log_id: null },
  { id: 'u3', nama: 'Pasir Beton', satuan: 'm3', qty: 40, tanggal: '2026-07-22', pelapor: 'Yono', lokasi: '', catatan: '', photos: [], project_name: 'A', log_id: null },
  // material yang tidak ada di rencana
  { id: 'u4', nama: 'Kawat Bendrat', satuan: 'kg', qty: 25, tanggal: '2026-07-22', pelapor: 'Yono', lokasi: '', catatan: '', photos: [], project_name: 'A', log_id: null },
]

const requests = [
  { id: 'r1', nama: 'Semen Portland 50kg', satuan: 'sak', qty: 200, status: 'menunggu', urgensi: 'segera', tanggal: '2026-07-23', pemohon: 'Yono', catatan: '', photos: [], butuh_tanggal: null, approver: '', approved_at: null, catatan_approval: '', project_name: 'A', log_id: null },
  { id: 'r2', nama: 'Besi Beton D13', satuan: 'btg', qty: 100, status: 'diterima', urgensi: 'darurat', tanggal: '2026-07-22', pemohon: 'Yono', catatan: '', photos: [], butuh_tanggal: null, approver: 'Admin', approved_at: null, catatan_approval: '', project_name: 'A', log_id: null },
  { id: 'r3', nama: 'Pasir Beton', satuan: 'm3', qty: 50, status: 'ditolak', urgensi: 'normal', tanggal: '2026-07-21', pemohon: 'Yono', catatan: '', photos: [], butuh_tanggal: null, approver: 'Admin', approved_at: null, catatan_approval: '', project_name: 'A', log_id: null },
]

const hasil = ringkasKekurangan(rencana, pemakaian, requests)
const cari = n => hasil.find(r => r.nama === n)

assert(hasil.length === 4, '3 material rencana + 1 di luar rencana')

// Semen: rencana 1000, terpakai 960 → sisa 40 (< 10% dari 1000) → perlu perhatian
const semen = cari('Semen Portland 50kg')
assert(semen.rencana === 1000 && semen.terpakai === 960, 'angka semen')
assert(semen.sisaRencana === 40, 'sisa rencana semen')
assert(semen.perluPerhatian === true, 'semen menipis (sisa < 10%) → perlu perhatian')
assert(semen.dalamProses === 200, 'request menunggu masuk dalamProses')
assert(semen.diterima === 0, 'request menunggu belum dihitung diterima')

// Besi: terpakai melebihi rencana → sisa negatif
const besi = cari('Besi Beton D13')
assert(besi.sisaRencana === -50, 'pemakaian besi melebihi rencana → sisa negatif')
assert(besi.perluPerhatian === true, 'besi over-pakai → perlu perhatian')
assert(besi.diterima === 100, 'request berstatus diterima masuk kolom diterima')
assert(besi.dalamProses === 0, 'request diterima tidak dihitung dua kali')

// Pasir: terpakai 40 dari 200 → aman; request ditolak tidak dihitung sama sekali
const pasir = cari('Pasir Beton')
assert(pasir.sisaRencana === 160 && pasir.perluPerhatian === false, 'pasir masih aman')
assert(pasir.dalamProses === 0 && pasir.diterima === 0, 'request ditolak diabaikan')

// Kawat bendrat: dipakai tapi tidak ada di Material Schedule
const kawat = cari('Kawat Bendrat')
assert(kawat.diluarRencana === true, 'material di luar rencana ditandai')
assert(kawat.rencana === 0 && kawat.terpakai === 25, 'angka material di luar rencana')
assert(kawat.perluPerhatian === true, 'material di luar rencana perlu perhatian')

// Urutan: yang perlu perhatian di depan
assert(hasil[hasil.length - 1].nama === 'Pasir Beton', 'material aman diletakkan paling belakang')

// Nama dengan beda huruf besar/kecil & spasi dianggap sama
const gabung = ringkasKekurangan(
  [{ id: 'x', materialName: 'Semen Gresik', estimatedVolume: 100, unit: 'sak', estimatedUnitPrice: 0, estimatedTotalCost: 0, linkedTasks: [] }],
  [{ id: 'y', nama: '  semen gresik ', satuan: 'sak', qty: 30, tanggal: '2026-07-01', pelapor: 'A', lokasi: '', catatan: '', photos: [], project_name: 'A', log_id: null }],
  [],
)
assert(gabung.length === 1 && gabung[0].terpakai === 30, 'nama material digabung tanpa peduli huruf besar/spasi')

// Daftar kosong tidak error
assert(ringkasKekurangan([], [], []).length === 0, 'data kosong menghasilkan tabel kosong')


// ── stokLapangan: nama & sisa material untuk halaman laporan publik ────────
// Tukang tidak boleh mengetik nama material dari nol; daftarnya datang dari
// pemakaian & request yang sudah tercatat pada log ini.
const U = (nama, qty, satuan = 'sak') => ({ nama, qty, satuan })
const R = (nama, qty, status, satuan = 'sak') => ({ nama, qty, status, satuan })

const s1 = stokLapangan(
  [U('Semen Portland 50kg', 40), U('semen portland 50kg', 10)],
  [R('Semen Portland 50kg', 100, 'diterima')],
)
assert(s1.length === 1, 'nama sama dengan penulisan berbeda digabung')
assert(s1[0].nama === 'Semen Portland 50kg', 'nama pertama yang dipakai')
assert(s1[0].masuk === 100 && s1[0].terpakai === 50, 'masuk & terpakai dijumlah')
assert(s1[0].stok === 50, 'stok = masuk − terpakai')
assert(s1[0].belumAdaPenerimaan === false, 'ada penerimaan tercatat')

// Status request menentukan apakah barangnya sudah ada atau masih di jalan.
const s2 = stokLapangan([], [
  R('Besi D13', 50, 'diterima'),
  R('Besi D13', 20, 'disetujui'),
  R('Besi D13', 30, 'menunggu'),
  R('Besi D13', 99, 'ditolak'),
])
assert(s2[0].masuk === 50, 'hanya yang diterima yang jadi stok')
assert(s2[0].dalamProses === 50, 'disetujui + menunggu masih dalam proses')
assert(s2[0].stok === 50, 'yang belum sampai tidak menambah stok')

// Material yang dipakai tapi penerimaannya belum pernah ditandai.
const s3 = stokLapangan([U('Paku', 5, 'kg')], [])
assert(s3[0].belumAdaPenerimaan === true, 'ditandai belum ada penerimaan')
assert(s3[0].stok === -5, 'stok negatif tetap dilaporkan apa adanya, tidak dipaksa nol')
assert(s3[0].satuan === 'kg', 'satuan ikut dari pemakaian')

// Satuan diambil dari mana pun yang mengisinya lebih dulu.
assert(stokLapangan([U('X', 1, '')], [R('X', 1, 'diterima', 'm3')])[0].satuan === 'm3',
  'satuan kosong diisi dari sumber lain')

// Masukan cacat tidak boleh merusak daftar.
assert(stokLapangan([U('', 5)], []).length === 0, 'baris tanpa nama diabaikan')
assert(stokLapangan([U('  ', 5)], []).length === 0, 'nama berisi spasi saja diabaikan')
assert(stokLapangan([U('X', -5)], [])[0].terpakai === 0, 'qty negatif diabaikan')
assert(stokLapangan([U('X', NaN)], [])[0].terpakai === 0, 'qty NaN diabaikan')
assert(stokLapangan(null, null).length === 0, 'null aman')
assert(stokLapangan([], []).length === 0, 'kosong aman')

// Urut menurut nama supaya daftarnya bisa ditelusuri.
const urut = stokLapangan([U('Zeng', 1), U('Aci', 1), U('Bata', 1)], [])
assert(urut.map(m => m.nama).join(',') === 'Aci,Bata,Zeng', 'urut menurut nama')

// ── Penerimaan lewat Delivery Order ────────────────────────────────────────
// Barang yang datang lewat DO adalah bukti fisik; penandaan 'diterima' pada
// request adalah cadangan untuk tim yang belum memakai alur PO. Keduanya bisa
// menyebut barang yang sama, jadi tidak boleh dijumlahkan.
const D = (nama, qty, satuan = 'sak') => ({ nama, qty, satuan })

const d1 = stokLapangan([U('Semen', 20)], [], [D('Semen', 100), D('Semen', 50)])
assert(d1[0].masuk === 150, 'DO dijumlah antar pengiriman')
assert(d1[0].stok === 130, 'stok = DO − terpakai')
assert(d1[0].belumAdaPenerimaan === false, 'DO menghitung sebagai penerimaan')

// DO menang atas penandaan manual, bukan ditambahkan.
const d2 = stokLapangan([], [R('Besi', 50, 'diterima')], [D('Besi', 50)])
assert(d2[0].masuk === 50, 'DO menang, tidak dijumlah dengan request diterima')

// Barang yang sudah datang tidak lagi dihitung "dalam perjalanan", meski
// status request-nya belum sempat diperbarui dari 'dibeli'.
const d3 = stokLapangan([], [R('Bata', 1000, 'dibeli')], [D('Bata', 600)])
assert(d3[0].masuk === 600, 'DO mengisi stok walau request masih dibeli')
assert(d3[0].dalamProses === 400, 'sisa yang belum datang saja yang dalam perjalanan')
const d4 = stokLapangan([], [R('Bata', 1000, 'dibeli')], [D('Bata', 1200)])
assert(d4[0].dalamProses === 0, 'kelebihan kirim tidak membuat dalamProses negatif')

// Material yang HANYA muncul di DO tetap masuk daftar saran.
const d5 = stokLapangan([], [], [D('Keramik 60x60', 30, 'dus')])
assert(d5.length === 1 && d5[0].satuan === 'dus', 'material dari DO ikut disarankan')

// Tanpa argumen ketiga, perilaku lama tidak berubah.
assert(stokLapangan([], [R('Semen', 10, 'diterima')])[0].masuk === 10,
  'tanpa data DO, penandaan manual tetap dipakai')
assert(stokLapangan([], [], null).length === 0, 'penerimaan null aman')

// ── Gudang di Akuntan: nota pembelian & penyesuaian manual ────────────────
// Material yang dibeli langsung di toko tidak pernah punya surat jalan. Tanpa
// membaca Inventori, barang itu selamanya "penerimaan belum tercatat".
const G = (nama, qty, satuan = 'Box') => ({ nama, qty, satuan })

{
  const g = stokLapangan([], [], [], { pembelian: [G('Paku kayu 2.5"', 30)] })
  assert(g.length === 1 && g[0].masuk === 30, 'nota pembelian mengisi stok')
  assert(g[0].belumAdaPenerimaan === false, 'nota dihitung sebagai penerimaan')
  assert(g[0].satuan === 'Box', 'satuan ikut dari nota')
}

// Tiga pintu masuk dijumlah, karena mencatat kejadian yang berbeda.
{
  const g = stokLapangan([U('Semen', 10)], [],
    [D('Semen', 100)], { pembelian: [G('Semen', 20, 'sak')], penyesuaian: [G('Semen', 5, 'sak')] })
  assert(g[0].masuk === 125, 'surat jalan + nota + koreksi positif dijumlah')
  assert(g[0].stok === 115, 'stok dikurangi pemakaian lapangan')
}

// Penyesuaian negatif adalah barang keluar dari gudang, bukan barang masuk.
{
  const g = stokLapangan([U('Triplek', 5, 'Pcs')], [],
    [], { pembelian: [G('Triplek', 40, 'Pcs')], penyesuaian: [G('Triplek', -8, 'Pcs')] })
  assert(g[0].masuk === 40, 'koreksi negatif tidak menambah masuk')
  assert(g[0].stok === 27, 'stok = 40 masuk - 5 dipakai - 8 koreksi keluar')
  assert(g[0].terpakai === 5, 'terpakai tetap hanya pemakaian lapangan')
}

// Penandaan manual hanya cadangan: kalah oleh sumber mana pun yang tercatat.
{
  const g = stokLapangan([], [R('Besi', 99, 'diterima')], [], { pembelian: [G('Besi', 40, 'btg')] })
  assert(g[0].masuk === 40, 'nota menang atas penandaan manual, tidak dijumlah')
  const tanpa = stokLapangan([], [R('Besi', 99, 'diterima')], [], { pembelian: [] })
  assert(tanpa[0].masuk === 99, 'tanpa sumber tercatat, penandaan manual dipakai')
}

// Barang yang sudah dibeli lewat nota tidak lagi "dalam perjalanan".
{
  const g = stokLapangan([], [R('Kayu', 100, 'dibeli')], [], { pembelian: [G('Kayu', 60)] })
  assert(g[0].dalamProses === 40, 'sisa yang belum datang saja yang dalam perjalanan')
}

// Masukan cacat dari gudang tidak merusak daftar.
{
  const g = stokLapangan([], [], [], {
    pembelian: [G('', 5), G('A', NaN)],
    penyesuaian: [G('  ', 3)],
  })
  assert(g.length === 1 && g[0].nama === 'A', 'baris tanpa nama diabaikan')
  assert(g[0].masuk === 0, 'qty NaN diabaikan')
}
assert(stokLapangan([], [], [], null).length === 0, 'gudang null aman')
assert(stokLapangan([], [], [], {}).length === 0, 'gudang kosong aman')

// ── cariMaterial ───────────────────────────────────────────────────────────
const daftar = stokLapangan([
  U('Semen Portland 50kg', 1), U('Besi Beton D13', 1),
  U('Besi polos 8mm', 1), U('Triplek 9mm', 1),
], [])

assert(cariMaterial(daftar, '').length === 4, 'tanpa ketikan, seluruh daftar ditawarkan')
assert(cariMaterial(daftar, 'besi').length === 2, 'cocok sebagian nama')
assert(cariMaterial(daftar, 'BESI').length === 2, 'tidak peka huruf besar')
assert(cariMaterial(daftar, 'semen 50').length === 1,
  'cocok per kata — "semen 50" menemukan "Semen Portland 50kg"')
assert(cariMaterial(daftar, '50 semen').length === 1, 'urutan kata tidak penting')
assert(cariMaterial(daftar, '  besi  d13  ').length === 1, 'spasi berlebih diabaikan')
assert(cariMaterial(daftar, 'tidak ada').length === 0, 'yang tidak cocok tidak dipaksakan')
assert(cariMaterial(daftar, '', 2).length === 2, 'batas jumlah saran dipatuhi')
assert(cariMaterial(daftar, '', 0).length === 0, 'batas nol menghasilkan kosong')
assert(cariMaterial([], 'besi').length === 0, 'daftar kosong aman')

console.log(`✅ material: ${ok} assertion lolos`)
