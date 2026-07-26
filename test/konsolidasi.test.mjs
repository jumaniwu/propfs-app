// Test lingkup laporan Akuntan (per proyek vs konsolidasi) dan ringkasan antar proyek.
import {
  saringLingkup, ringkasPerProyek, totalKonsolidasi, PROYEK_UMUM, LABEL_PROYEK_UMUM,
} from '../src/lib/akuntan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const dekat = (a, b, tol = 0.01) => Math.abs(a - b) < tol

const pemasukan = [
  { id: '1', tanggal: '2026-07-01', sumber: 'Termin 1', kategori: 'termin', jumlah: 500_000_000, projectId: 'p1' },
  { id: '2', tanggal: '2026-07-15', sumber: 'Termin 2', kategori: 'termin', jumlah: 300_000_000, projectId: 'p1' },
  { id: '3', tanggal: '2026-07-20', sumber: 'Termin A', kategori: 'termin', jumlah: 200_000_000, projectId: 'p2' },
  { id: '4', tanggal: '2026-07-02', sumber: 'Modal awal', kategori: 'modal', jumlah: 50_000_000 }, // tanpa proyek
]
const pengeluaran = [
  { id: 'a', tipe: 'material', tanggal: '2026-07-05', keterangan: 'Semen', kategori: 'bangunan', jumlah: 200_000_000, projectId: 'p1' },
  { id: 'b', tipe: 'upah', tanggal: '2026-07-12', keterangan: 'Upah', kategori: 'bangunan', jumlah: 100_000_000, projectId: 'p1' },
  { id: 'c', tipe: 'material', tanggal: '2026-07-21', keterangan: 'Besi', kategori: 'bangunan', jumlah: 80_000_000, projectId: 'p2' },
  { id: 'd', tipe: 'operasional', tanggal: '2026-07-03', keterangan: 'Sewa kantor', kategori: 'operasional', jumlah: 10_000_000 }, // tanpa proyek
]

// ── saringLingkup ──────────────────────────────────────────────────────────
assert(saringLingkup(pemasukan, { jenis: 'konsolidasi' }).length === 4, 'konsolidasi ambil semua entri')
assert(saringLingkup(pemasukan, { jenis: 'proyek', projectId: 'p1' }).length === 2, 'lingkup p1 = 2 pemasukan')
assert(saringLingkup(pemasukan, { jenis: 'proyek', projectId: 'p2' }).length === 1, 'lingkup p2 = 1 pemasukan')
assert(saringLingkup(pemasukan, { jenis: 'proyek', projectId: PROYEK_UMUM }).length === 1, 'entri tanpa projectId masuk grup Umum')
assert(saringLingkup(pengeluaran, { jenis: 'proyek', projectId: 'p1' }).length === 2, 'lingkup p1 = 2 pengeluaran')

// ── ringkasPerProyek ───────────────────────────────────────────────────────
const proyek = [
  { id: 'p1', nama: 'Green Valley', rab: 1_000_000_000, progressPct: 40 },
  { id: 'p2', nama: 'Sentra Niaga', rab: 400_000_000, progressPct: 15 },
]
const baris = ringkasPerProyek(proyek, pemasukan, pengeluaran)

assert(baris.length === 3, 'dua proyek + satu grup Umum (karena ada entri non-proyek)')
const p1 = baris.find(b => b.projectId === 'p1')
assert(p1.pemasukan === 800_000_000, 'pemasukan p1 dijumlah')
assert(p1.pengeluaran === 300_000_000, 'pengeluaran p1 dijumlah')
assert(p1.laba === 500_000_000, 'laba p1 = pemasukan - pengeluaran')
assert(dekat(p1.terpakaiPct, 30), 'terpakai p1 = 300jt/1M = 30%')
assert(dekat(p1.deviasiPct, 10), 'deviasi p1 = progress 40% - terpakai 30% = +10')

const p2 = baris.find(b => b.projectId === 'p2')
assert(dekat(p2.terpakaiPct, 20), 'terpakai p2 = 80jt/400jt = 20%')
assert(dekat(p2.deviasiPct, -5), 'deviasi p2 = 15% - 20% = -5 (biaya lebih cepat)')

const umum = baris.find(b => b.projectId === PROYEK_UMUM)
assert(umum.namaProyek === LABEL_PROYEK_UMUM, 'label grup non-proyek')
assert(umum.pemasukan === 50_000_000 && umum.pengeluaran === 10_000_000, 'angka grup non-proyek')
assert(umum.rab === 0, 'grup non-proyek tidak punya RAB')

// grup Umum tidak muncul bila tidak ada entri tanpa proyek
const tanpaUmum = ringkasPerProyek(
  proyek,
  pemasukan.filter(p => p.projectId),
  pengeluaran.filter(e => e.projectId),
)
assert(tanpaUmum.length === 2, 'grup Umum disembunyikan bila kosong')

// proyek tanpa transaksi tetap muncul dengan nilai nol
const kosong = ringkasPerProyek([{ id: 'p9', nama: 'Baru', rab: 0, progressPct: 0 }], [], [])
assert(kosong.length === 1 && kosong[0].laba === 0 && kosong[0].terpakaiPct === 0, 'proyek tanpa transaksi aman dari bagi nol')

// ── totalKonsolidasi ───────────────────────────────────────────────────────
const total = totalKonsolidasi(baris)
assert(total.pemasukan === 1_050_000_000, 'total pemasukan seluruh proyek')
assert(total.pengeluaran === 390_000_000, 'total pengeluaran seluruh proyek')
assert(total.laba === 660_000_000, 'total laba konsolidasi')
assert(total.rab === 1_400_000_000, 'total RAB (grup Umum menyumbang 0)')

console.log(`✅ konsolidasi: ${ok} assertion lolos`)
