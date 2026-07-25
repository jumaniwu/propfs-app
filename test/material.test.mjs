// Test ringkasan kekurangan material: rencana (Material Schedule) vs pemakaian
// lapangan vs request material.
import { ringkasKekurangan } from '../src/lib/materialApi.ts'

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

console.log(`✅ material: ${ok} assertion lolos`)
