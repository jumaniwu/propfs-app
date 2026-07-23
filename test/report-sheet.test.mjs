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
console.log('buildReportSheet:', ok, 'assert lulus')
