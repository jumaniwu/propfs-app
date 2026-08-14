import { buildReportSheet } from '../src/utils/excel.ts'
import * as xlsx from 'xlsx'
let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const ws = buildReportSheet({
  title: 'LAPORAN UJI', subtitle: 'Proyek: Uji · 2 transaksi',
  headers: ['No', 'Nama', 'Total (Rp)'],
  rows: [[1, 'Semen 20 sak', 1160000], [2, 'Bata 2000 pcs', 3500000]],
  sumCols: [2],
})
assert(ws['A1'].v === 'LAPORAN UJI', 'judul di A1')
assert(ws['A2'].v.includes('Proyek: Uji'), 'subjudul di A2')
assert(ws['A4'].v === 'No' && ws['C4'].v === 'Total (Rp)', 'header di baris 4')
assert(ws['C5'].v === 1160000 && ws['C5'].z === '#,##0', 'angka berformat ribuan')
assert(ws['A7'].v === 'TOTAL', 'baris TOTAL')
assert(ws['C7'].f === 'SUM(C5:C6)', 'rumus SUM benar: ' + ws['C7'].f)
assert(ws['C7'].v === 4660000, 'nilai cache TOTAL terhitung: ' + ws['C7'].v)
assert(ws['!merges'].length === 2, 'judul di-merge')
assert(ws['A4'].s && ws['A4'].s.fill && ws['A4'].s.fill.fgColor.rgb === '0D1B2A', 'header berlatar navy')
assert(ws['A4'].s.font.color.rgb === 'FFFFFF', 'font header putih')
assert(ws['A7'].s && ws['A7'].s.fill.fgColor.rgb === 'F0E6CE', 'baris TOTAL berlatar emas muda')
assert(ws['A5'].s && ws['A5'].s.border && ws['A5'].s.border.top, 'sel data berbingkai')
assert(ws['A1'].s && ws['A1'].s.font.bold === true, 'judul tebal')
assert(ws['!cols'].length === 3 && ws['!cols'][1].wch >= 'Bata 2000 pcs'.length, 'lebar kolom otomatis')

// roundtrip tulis-baca
const buf = xlsx.write({ SheetNames: ['Uji'], Sheets: { Uji: ws } }, { type: 'buffer', bookType: 'xlsx' })
const rb = xlsx.read(buf, { type: 'buffer', cellFormula: true })
const ws2 = rb.Sheets['Uji']
assert(ws2['C7'].f && ws2['C7'].f.includes('SUM'), 'SUM bertahan setelah roundtrip')
assert(ws2['A1'].v === 'LAPORAN UJI', 'judul bertahan setelah roundtrip')

// sheet kosong tidak error
const empty = buildReportSheet({ title: 'X', subtitle: 'Y', headers: ['A', 'B'], rows: [], sumCols: [1] })
assert(empty['B5'].v === 0, 'sheet kosong: TOTAL 0 tanpa rumus')

// ── Kop perusahaan & watermark ────────────────────────────────────────────
const dataUji = [['a', 1], ['b', 2]]

// tanpa kop: susunan lama tidak berubah
const polos = buildReportSheet({ title: 'JUDUL', subtitle: 'SUB', headers: ['Nama', 'Nilai'], rows: dataUji, sumCols: [1] })
assert(polos['A1'].v === 'JUDUL', 'tanpa kop: judul tetap di A1')
assert(polos['A4'].v === 'Nama', 'tanpa kop: header tetap di baris 4')
assert(polos['B7'].f.includes('SUM(B5:B6)'), 'tanpa kop: rumus SUM menunjuk baris data yang benar')

// dengan kop dua baris: semuanya bergeser 2 baris, rumus ikut menyesuaikan
const berkop = buildReportSheet({
  title: 'JUDUL', subtitle: 'SUB', headers: ['Nama', 'Nilai'], rows: dataUji, sumCols: [1],
  kop: 'PT Propfs Karya Utama', kopKontak: 'Bekasi · 021-1234567',
})
assert(berkop['A1'].v === 'PT Propfs Karya Utama', 'kop perusahaan di baris 1')
assert(berkop['A2'].v === 'Bekasi · 021-1234567', 'kontak perusahaan di baris 2')
assert(berkop['A3'].v === 'JUDUL', 'judul bergeser ke baris 3')
assert(berkop['A6'].v === 'Nama', 'header bergeser ke baris 6')
assert(berkop['B9'].f.includes('SUM(B7:B8)'), 'rumus SUM ikut bergeser mengikuti kop')
assert(berkop['B9'].v === 3, 'nilai TOTAL tetap benar setelah bergeser')
assert(berkop['!merges'].length === 4, 'kop, kontak, judul, dan subjudul sama-sama di-merge')

// kop tanpa baris kontak hanya menggeser 1 baris
const kopSaja = buildReportSheet({
  title: 'JUDUL', subtitle: 'SUB', headers: ['Nama', 'Nilai'], rows: dataUji, sumCols: [1],
  kop: 'CV Maju',
})
assert(kopSaja['A2'].v === 'JUDUL', 'kop tanpa kontak: judul bergeser 1 baris')
assert(kopSaja['B8'].f.includes('SUM(B6:B7)'), 'kop tanpa kontak: rumus SUM benar')

// Tidak ada baris apa pun di bawah TOTAL. Watermark "PropFS — Versi Gratis"
// sudah dihapus dari seluruh dokumen, dan `watermark` bukan lagi kolom yang
// dikenali — memberikannya tidak boleh diam-diam menghidupkannya kembali.
assert(!berkop['A11'], 'tidak ada baris tambahan di bawah TOTAL')
const dipaksa = buildReportSheet({
  title: 'JUDUL', subtitle: 'SUB', headers: ['Nama', 'Nilai'], rows: dataUji, sumCols: [1],
  kop: 'PT Uji', kopKontak: 'Kontak', watermark: 'PropFS — Versi Gratis',
})
assert(!dipaksa['A11'], 'kolom watermark diabaikan, bukan dicetak')
assert(!JSON.stringify(dipaksa).includes('Versi Gratis'),
  'tidak ada sel mana pun yang memuat teks watermark')

console.log('buildReportSheet:', ok, 'assert lulus')
