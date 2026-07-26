// Test ringkasan dashboard Home: status progres (telat/on track) & stok menipis.
import {
  rencanaProgres, ringkasProgres, stokMenipis, LABEL_STATUS,
  TOLERANSI_PCT, AMBANG_MENIPIS_PCT,
} from '../src/lib/dashboardLapangan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const dekat = (a, b, tol = 0.5) => Math.abs(a - b) < tol

const kini = new Date('2026-07-26T00:00:00Z')

// ── rencanaProgres ─────────────────────────────────────────────────────────
// mulai 2026-01-01, durasi 12 bulan (360 hari); 26 Juli = hari ke-206
const r1 = rencanaProgres('2026-01-01', 12, kini)
assert(r1.totalHari === 360, 'durasi 12 bulan = 360 hari')
assert(r1.hariBerjalan === 206, 'hari berjalan dihitung dari tanggal mulai')
assert(dekat(r1.rencanaPct, 57.2), 'rencana ≈ 57% pada hari ke-206 dari 360')

// proyek yang belum mulai
const r2 = rencanaProgres('2026-12-01', 6, kini)
assert(r2.hariBerjalan < 0, 'proyek belum mulai = hari berjalan negatif')
assert(r2.rencanaPct === 0, 'rencana 0% sebelum proyek mulai')

// proyek yang sudah lewat jadwal → dibatasi 100%
const r3 = rencanaProgres('2024-01-01', 6, kini)
assert(r3.rencanaPct === 100, 'rencana dibatasi maksimal 100%')

// tanggal tidak valid tidak bikin error
assert(rencanaProgres('bukan-tanggal', 6, kini).rencanaPct === 0, 'tanggal tidak valid aman')
assert(rencanaProgres('2026-01-01', 0, kini).totalHari === 1, 'durasi 0 tidak menyebabkan bagi nol')

// ── ringkasProgres ─────────────────────────────────────────────────────────
const hasil = ringkasProgres([
  // rencana ≈57%; realisasi 20% → tertinggal jauh
  { id: 'p1', nama: 'Telat', progressPct: 20, startDate: '2026-01-01', durasiBulan: 12 },
  // realisasi 57% → pas sesuai jadwal
  { id: 'p2', nama: 'Pas', progressPct: 57, startDate: '2026-01-01', durasiBulan: 12 },
  // realisasi 80% → lebih cepat
  { id: 'p3', nama: 'Cepat', progressPct: 80, startDate: '2026-01-01', durasiBulan: 12 },
  // belum mulai
  { id: 'p4', nama: 'Nanti', progressPct: 0, startDate: '2026-12-01', durasiBulan: 6 },
], kini)

assert(hasil.find(h => h.projectId === 'p1').status === 'telat', 'tertinggal jauh = telat')
assert(hasil.find(h => h.projectId === 'p2').status === 'on_track', 'sesuai jadwal = on track')
assert(hasil.find(h => h.projectId === 'p3').status === 'lebih_cepat', 'melebihi jadwal = lebih cepat')
assert(hasil.find(h => h.projectId === 'p4').status === 'belum_mulai', 'belum mulai dikenali')
assert(hasil.find(h => h.projectId === 'p1').selisihPct < 0, 'selisih negatif untuk yang telat')

// tepat di ambang toleransi masih dianggap on track
const ambang = ringkasProgres([{
  id: 'x', nama: 'Ambang', progressPct: r1.rencanaPct - TOLERANSI_PCT, startDate: '2026-01-01', durasiBulan: 12,
}], kini)
assert(ambang[0].status === 'on_track', `selisih tepat -${TOLERANSI_PCT}% masih on track`)

assert(LABEL_STATUS.telat === 'Telat' && LABEL_STATUS.on_track === 'On Track', 'label status tersedia')
assert(ringkasProgres([], kini).length === 0, 'tanpa proyek aman')

// ── stokMenipis ────────────────────────────────────────────────────────────
const rencana = [
  { id: 'm1', materialName: 'Semen Portland 50kg', estimatedVolume: 1000, unit: 'sak', estimatedUnitPrice: 0, estimatedTotalCost: 0, linkedTasks: [] },
  { id: 'm2', materialName: 'Besi Beton D13', estimatedVolume: 500, unit: 'btg', estimatedUnitPrice: 0, estimatedTotalCost: 0, linkedTasks: [] },
  { id: 'm3', materialName: 'Pasir Beton', estimatedVolume: 200, unit: 'm3', estimatedUnitPrice: 0, estimatedTotalCost: 0, linkedTasks: [] },
  { id: 'm4', materialName: 'Cat Tembok', estimatedVolume: 100, unit: 'kaleng', estimatedUnitPrice: 0, estimatedTotalCost: 0, linkedTasks: [] },
]
const pakai = (nama, qty) => ({ id: nama, nama, satuan: '', qty, tanggal: '2026-07-01', pelapor: 'A', lokasi: '', catatan: '', photos: [], project_name: '', log_id: null })
const req = (nama, qty, status) => ({ id: nama + status, nama, satuan: '', qty, status, urgensi: 'normal', tanggal: '2026-07-01', pemohon: 'A', catatan: '', photos: [], butuh_tanggal: null, approver: '', approved_at: null, catatan_approval: '', project_name: '', log_id: null })

const stok = stokMenipis(rencana, [
  pakai('Semen Portland 50kg', 950),   // sisa 50 = 5%  → menipis
  pakai('Besi Beton D13', 520),        // sisa -20      → habis/terlampaui
  pakai('Pasir Beton', 40),            // sisa 160 = 80% → aman
  // Cat Tembok belum dipakai sama sekali → tidak diperingatkan
], [
  req('Semen Portland 50kg', 200, 'menunggu'),
  req('Besi Beton D13', 100, 'diterima'),   // sudah datang, bukan "dalam proses"
  req('Pasir Beton', 50, 'ditolak'),
])

assert(stok.length === 2, 'hanya material menipis/terlampaui yang muncul')
assert(stok[0].nama === 'Besi Beton D13', 'yang paling kritis di urutan pertama')
assert(stok[0].habis === true, 'pemakaian melebihi rencana ditandai habis')
assert(stok[0].sisa === -20, 'sisa negatif dihitung benar')
assert(stok[0].dalamProses === 0, 'request yang sudah diterima tidak dihitung dalam proses')

const semen = stok.find(s => s.nama === 'Semen Portland 50kg')
assert(semen.sisa === 50 && dekat(semen.sisaPct, 5), 'sisa semen 50 (5%)')
assert(semen.habis === false, 'semen belum habis, hanya menipis')
assert(semen.dalamProses === 200, 'request menunggu dihitung sebagai dalam proses')

assert(!stok.find(s => s.nama === 'Pasir Beton'), 'material yang masih aman tidak diperingatkan')
assert(!stok.find(s => s.nama === 'Cat Tembok'), 'material yang belum dipakai tidak diperingatkan')

// ambang bisa disetel
const longgar = stokMenipis(rencana, [pakai('Pasir Beton', 40)], [], 90)
assert(longgar.length === 1, 'ambang longgar memunculkan lebih banyak material')
assert(AMBANG_MENIPIS_PCT === 20, 'ambang bawaan 20%')

assert(stokMenipis([], [], []).length === 0, 'data kosong aman')

console.log(`✅ dashboardLapangan: ${ok} assertion lolos`)
