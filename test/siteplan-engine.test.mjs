/**
 * Unit test engine siteplan (tanpa browser).
 * Jalankan: node --experimental-strip-types test/siteplan-engine.test.mjs
 */
import * as Geom from '../src/engine/siteplan/geometry.ts'
import { generateSiteplan, defaultSiteplanParams } from '../src/engine/siteplan/layout.ts'
import { parseOcrCoords, parseManualCoords } from '../src/engine/siteplan/ocrParse.ts'
import { buildDxf } from '../src/engine/siteplan/exportDxf.ts'
import { SITEPLAN_PRESETS } from '../src/engine/siteplan/presets.ts'

let passed = 0, failed = 0
function assert(cond, msg) {
  if (cond) { passed++ }
  else { failed++; console.error('  ✗ GAGAL:', msg) }
}
function section(name) { console.log('•', name) }

/* ---------- Geometri ---------- */
section('Geometri')
const square = [[0, 0], [10, 0], [10, 10], [0, 10]]
assert(Math.abs(Geom.polygonArea(square) - 100) < 1e-9, 'luas persegi 10x10 = 100')
const concave = [[0, 0], [10, 0], [10, 10], [6, 10], [6, 4], [4, 4], [4, 10], [0, 10]]
assert(!Geom.pointInPolygon([5, 8], concave), 'titik dalam takik di luar')
assert(Geom.pointInPolygon([2, 8], concave), 'titik samping takik di dalam')
assert(!Geom.isSimplePolygon([[0, 0], [10, 10], [10, 0], [0, 10]]), 'bowtie terdeteksi')
let clipped = Geom.clipPolyToRect(concave, { x1: 0, y1: 5, x2: 10, y2: 10 })
assert(Math.abs(Geom.polygonArea(clipped) - 40) < 1e-6, 'clip concave memotong takik → luas 40')
assert(!Geom.rectFullyInside({ x1: 3, y1: 5, x2: 7, y2: 9 }, concave), 'rect menabrak takik ditolak')

/* ---------- Layout ---------- */
function checkSiteplan(name, coords, params) {
  section('Layout: ' + name)
  const result = generateSiteplan(coords, params)
  const kavling = result.parcels.filter(p => p.type === 'kavling')
  const komersial = result.parcels.filter(p => p.type === 'komersial')
  assert(kavling.length > 0, 'ada kavling (' + kavling.length + ')')

  let allInside = true
  for (const p of [...kavling, ...komersial]) {
    const c = Geom.centroid(p.polygon)
    for (const v of p.polygon) {
      const shrunk = [v[0] + (c[0] - v[0]) * 0.01, v[1] + (c[1] - v[1]) * 0.01]
      if (!Geom.pointInPolygon(shrunk, result.boundary)) { allInside = false; break }
    }
  }
  assert(allInside, 'semua kavling/komersial di dalam batas lahan')

  let overlap = false
  const lots = [...kavling, ...komersial]
  for (let i = 0; i < lots.length && !overlap; i++) {
    const ci = Geom.centroid(lots[i].polygon)
    for (let j = 0; j < lots.length; j++) {
      if (i !== j && Geom.pointInPolygon(ci, lots[j].polygon, 1e-12)) { overlap = true; break }
    }
  }
  assert(!overlap, 'tidak ada kavling tumpang tindih')

  const sumPct = Object.values(result.stats.byType).reduce((s, t) => s + t.pct, 0)
  assert(sumPct > 90 && sumPct < 105, 'total persentase wajar (' + sumPct.toFixed(1) + '%)')
  const labels = new Set(kavling.map(p => p.label))
  assert(labels.size === kavling.length, 'label kavling unik')
  console.log('   →', kavling.length, 'kavling,', komersial.length, 'ruko, efisiensi',
    result.stats.efficiencyPct + '%, warnings:', result.warnings.length)
  return result
}

checkSiteplan(SITEPLAN_PRESETS[0].name, SITEPLAN_PRESETS[0].coords, defaultSiteplanParams())
checkSiteplan(SITEPLAN_PRESETS[1].name, SITEPLAN_PRESETS[1].coords, defaultSiteplanParams())
const pRuko = defaultSiteplanParams()
pRuko.commercial = { enabled: true, w: 5, d: 15, maxCount: 8 }
const rRuko = checkSiteplan('Preset 1 + ruko', SITEPLAN_PRESETS[0].coords, pRuko)
assert(rRuko.parcels.filter(p => p.type === 'komersial').length > 0, 'ruko terbentuk')

section('Layout: validasi input')
let threw = false
try { generateSiteplan([[0, 0], [1, 0]], defaultSiteplanParams()) } catch { threw = true }
assert(threw, '<3 titik → error')
threw = false
try { generateSiteplan([[0, 0], [10, 10], [10, 0], [0, 10]], defaultSiteplanParams()) } catch { threw = true }
assert(threw, 'self-intersect → error')

/* ---------- Parser OCR & manual ---------- */
section('parseOcrCoords')
let ocr = parseOcrCoords('1 698450.25 9214300.10\n2 698570.00 9214310.50\n3 698560.75 9214395.00')
assert(ocr.points.length === 3 && ocr.offset !== null, 'tabel bernomor + offset UTM')
assert(Math.abs(ocr.points[1][0] - 119.75) < 1e-6, 'jarak relatif dipertahankan')
ocr = parseOcrCoords('1 698.450,25 9.214.300,10\n2 698.570,00 9.214.310,50\n3 698.560,00 9.214.395,00')
assert(Math.abs((ocr.points[1][0] - ocr.points[0][0]) - 119.75) < 1e-6, 'format id-ID diparse benar')
ocr = parseOcrCoords('1 1O0 2OO\n2 15l 210\n3 120 30O')
assert(ocr.points[0][0] === 100 && ocr.points[0][1] === 200, 'salah baca O→0/l→1 dikoreksi')
ocr = parseOcrCoords('0,0\n120,0\n115,85\n5,80')
assert(ocr.points.length === 4 && ocr.points[2][0] === 115, 'format x,y sederhana')

section('parseManualCoords')
const man = parseManualCoords('0,0\n120 0\nabc\n115;85')
assert(man.points.length === 3 && man.errors.length === 1, 'toleran multi-format + laporan error')

/* ---------- DXF ---------- */
section('buildDxf')
const dxfRes = generateSiteplan(SITEPLAN_PRESETS[0].coords, defaultSiteplanParams())
const dxf = buildDxf(dxfRes)
const nPoly = (dxf.match(/\nPOLYLINE\n/g) || []).length
assert(nPoly === dxfRes.parcels.length + 1, 'POLYLINE = parcels + boundary')
assert((dxf.match(/\nSEQEND\n/g) || []).length === nPoly, 'setiap POLYLINE ditutup SEQEND')
for (const layer of ['BOUNDARY', 'JALAN', 'KAVLING', 'RTH', 'FASUM', 'KOMERSIAL', 'LABEL']) {
  assert(dxf.includes('\n' + layer + '\n'), 'layer ' + layer)
}

console.log('\nHasil:', passed, 'lulus,', failed, 'gagal')
process.exit(failed ? 1 : 0)
