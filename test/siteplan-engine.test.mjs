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

/* ---------- Konsep pembangunan ---------- */
section('Konsep: ruko')
const pKonsepRuko = defaultSiteplanParams()
pKonsepRuko.concept = 'ruko'
const rKonsepRuko = generateSiteplan(SITEPLAN_PRESETS[0].coords, pKonsepRuko)
assert(rKonsepRuko.stats.counts.komersial > 0, 'semua unit jadi ruko (' + rKonsepRuko.stats.counts.komersial + ')')
assert(rKonsepRuko.stats.counts.kavling === 0, 'tidak ada kavling rumah')

section('Konsep: apartemen')
const pApt = defaultSiteplanParams()
pApt.concept = 'apartemen'
pApt.tower = { w: 20, d: 30, count: 2 }
const rApt = generateSiteplan(SITEPLAN_PRESETS[0].coords, pApt)
const towers = rApt.parcels.filter(p => p.type === 'tower')
assert(towers.length >= 1 && towers.length <= 2, 'tower terbentuk (' + towers.length + ')')
assert(rApt.stats.counts.tower === towers.length, 'counts.tower konsisten')
let towersInside = true
for (const t of towers) {
  const c = Geom.centroid(t.polygon)
  for (const v of t.polygon) {
    const shrunk = [v[0] + (c[0] - v[0]) * 0.01, v[1] + (c[1] - v[1]) * 0.01]
    if (!Geom.pointInPolygon(shrunk, rApt.boundary)) towersInside = false
  }
}
assert(towersInside, 'tower di dalam batas lahan')
assert(rApt.stats.byType.parkir.area > 0, 'ada area parkir (' + rApt.stats.byType.parkir.area + ' m²)')
assert(rApt.stats.counts.kavling === 0 && rApt.stats.counts.komersial === 0, 'tanpa kavling/ruko')

section('Konsep: hotel')
const pHotel = defaultSiteplanParams()
pHotel.concept = 'hotel'
const rHotel = generateSiteplan(SITEPLAN_PRESETS[1].coords, pHotel)
assert(rHotel.parcels.some(p => p.type === 'tower' && p.label && p.label.includes('HOTEL')), 'tower hotel berlabel HOTEL')

section('Konsep: mixed')
const pMix = defaultSiteplanParams()
pMix.concept = 'mixed'
const rMix = generateSiteplan(SITEPLAN_PRESETS[0].coords, pMix)
assert(rMix.stats.counts.komersial > 0 && rMix.stats.counts.kavling > 0, 'mixed: ada ruko (' + rMix.stats.counts.komersial + ') dan kavling (' + rMix.stats.counts.kavling + ')')

section('Konsep: mixed + tower (semua sekaligus)')
const pMixAll = defaultSiteplanParams()
pMixAll.concept = 'mixed'
pMixAll.mixTower = true
pMixAll.tower = { w: 20, d: 30, count: 1 }
const rMixAll = generateSiteplan(SITEPLAN_PRESETS[1].coords, pMixAll)
assert(rMixAll.stats.counts.tower >= 1, 'mixed+tower: ada tower (' + rMixAll.stats.counts.tower + ')')
assert(rMixAll.stats.counts.komersial > 0, 'mixed+tower: ada ruko (' + rMixAll.stats.counts.komersial + ')')
assert(rMixAll.stats.counts.kavling > 0, 'mixed+tower: ada rumah (' + rMixAll.stats.counts.kavling + ')')
{
  // tower & ruko tidak tumpang tindih (centroid saling di luar)
  const twr = rMixAll.parcels.filter(p => p.type === 'tower')
  const rk = rMixAll.parcels.filter(p => p.type === 'komersial')
  let ovl = false
  for (const t of twr) {
    const c = Geom.centroid(t.polygon)
    for (const r of rk) if (Geom.pointInPolygon(c, r.polygon, 1e-12)) ovl = true
  }
  assert(!ovl, 'mixed+tower: tower tidak tumpang tindih ruko')
}
// tanpa flag mixTower → perilaku lama (tanpa tower)
const pMixOld = defaultSiteplanParams()
pMixOld.concept = 'mixed'
assert(generateSiteplan(SITEPLAN_PRESETS[0].coords, pMixOld).stats.counts.tower === 0, 'mixed tanpa flag → tidak ada tower')

section('Konsep: mixed checklist komponen')
// semua komponen: rumah + ruko + tower + plaza
const pAll = defaultSiteplanParams()
pAll.concept = 'mixed'
pAll.mix = { rumah: true, ruko: true, tower: true, plaza: true }
pAll.tower = { w: 20, d: 30, count: 1 }
pAll.plaza = { w: 30, d: 20 }
const rAll = generateSiteplan(SITEPLAN_PRESETS[1].coords, pAll)
assert(rAll.stats.counts.kavling > 0 && rAll.stats.counts.komersial > 0 && rAll.stats.counts.tower >= 1,
  'semua komponen hadir (rumah/ruko/tower)')
assert(rAll.stats.byType.plaza.area > 0, 'plaza hadir (' + rAll.stats.byType.plaza.area + ' m²)')
// tanpa rumah: ruko + plaza saja
const pNoHouse = defaultSiteplanParams()
pNoHouse.concept = 'mixed'
pNoHouse.mix = { rumah: false, ruko: true, tower: false, plaza: true }
const rNoHouse = generateSiteplan(SITEPLAN_PRESETS[0].coords, pNoHouse)
assert(rNoHouse.stats.counts.kavling === 0, 'tanpa rumah: kavling 0')
assert(rNoHouse.stats.counts.komersial > 0, 'tanpa rumah: ruko tetap ada')
assert(rNoHouse.stats.byType.plaza.area > 0, 'tanpa rumah: plaza ada')
assert(rNoHouse.stats.byType.parkir.area > 0, 'tanpa rumah: baris belakang jadi parkir')
// tidak ada komponen → error
let threwMix = false
const pNone = defaultSiteplanParams()
pNone.concept = 'mixed'
pNone.mix = { rumah: false, ruko: false, tower: false, plaza: false }
try { generateSiteplan(SITEPLAN_PRESETS[0].coords, pNone) } catch { threwMix = true }
assert(threwMix, 'tanpa komponen → error')
// kompatibilitas: param lama mixTower masih bekerja
const pCompat = defaultSiteplanParams()
pCompat.concept = 'mixed'
pCompat.mixTower = true
assert(generateSiteplan(SITEPLAN_PRESETS[0].coords, pCompat).stats.counts.tower >= 1, 'kompat mixTower lama')

section('Batas jumlah rumah (lot.maxCount)')
const pTarget = defaultSiteplanParams()
pTarget.lot = { w: 6, d: 12, maxCount: 30 }
const rTarget = generateSiteplan(SITEPLAN_PRESETS[0].coords, pTarget)
assert(rTarget.stats.counts.kavling <= 30, 'jumlah rumah dibatasi target (' + rTarget.stats.counts.kavling + ' ≤ 30)')
assert(rTarget.stats.byType.rth.area > 0, 'kelebihan lahan menjadi RTH')

section('Posisi jalan utama (frontageEdge)')
// persegi panjang: sisi terpanjang = bawah (index 0). Paksa frontage ke sisi kanan (index 1)
const rectLand = [[0, 0], [200, 0], [200, 80], [0, 80]]
for (const edge of [0, 1, 2, 3]) {
  const pf = defaultSiteplanParams()
  pf.frontageEdge = edge
  const rf = generateSiteplan(rectLand, pf)
  // rotasi boundary CCW dengan -theta: sisi terpilih harus horizontal di bawah
  const ccw = Geom.ensureCCW(rectLand)
  const c = Geom.centroid(ccw)
  const rot = Geom.rotatePoints(ccw, -rf.theta, c)
  const a = rot[edge]
  const b = rot[(edge + 1) % rot.length]
  const bbAll = Geom.bbox(rot)
  assert(Math.abs(a[1] - b[1]) < 1e-6, `sisi ${edge + 1} horizontal setelah rotasi frame`)
  assert(Math.abs(a[1] - bbAll.minY) < 1e-6, `sisi ${edge + 1} berada di bawah (frontage)`)
  assert(rf.parcels.filter(p => p.type === 'kavling').length > 0, `frontage sisi ${edge + 1}: kavling tetap terbentuk`)
}
// frontageEdge tidak valid → fallback otomatis tanpa error
const pfx = defaultSiteplanParams()
pfx.frontageEdge = 99
assert(generateSiteplan(rectLand, pfx).parcels.length > 0, 'frontageEdge tidak valid → fallback otomatis')

section('Gaya jalan LOOP (engine v2)')
const pLoop = defaultSiteplanParams()
pLoop.commercial = { enabled: true, w: 5, d: 15, maxCount: 10 }
const rLoop = generateSiteplan(SITEPLAN_PRESETS[0].coords, pLoop)
assert(rLoop.params.roadStyle === 'loop', 'default gaya loop')
const perimLots = rLoop.parcels.filter(p => p.type === 'kavling' && p.block === 'P')
assert(perimLots.length > 10, 'kavling perimeter menghadap ring (' + perimLots.length + ')')
assert(rLoop.stats.counts.komersial > 0, 'ruko frontage ada (' + rLoop.stats.counts.komersial + ')')
{
  let inside = true
  for (const p of rLoop.parcels.filter(x => x.type === 'kavling' || x.type === 'komersial')) {
    const c = Geom.centroid(p.polygon)
    for (const v of p.polygon) {
      const sh = [v[0] + (c[0] - v[0]) * 0.02, v[1] + (c[1] - v[1]) * 0.02]
      if (!Geom.pointInPolygon(sh, rLoop.boundary)) inside = false
    }
  }
  assert(inside, 'loop: semua kavling/ruko dalam batas lahan')
  const sumPctLoop = Object.values(rLoop.stats.byType).reduce((a, t) => a + t.pct, 0)
  assert(sumPctLoop > 85 && sumPctLoop < 108, 'loop: total persentase wajar (' + sumPctLoop.toFixed(1) + '%)')
}
// gaya grid eksplisit masih bekerja seperti lama
const pGrid = defaultSiteplanParams()
pGrid.roadStyle = 'grid'
const rGrid = generateSiteplan(SITEPLAN_PRESETS[0].coords, pGrid)
assert(rGrid.parcels.filter(p => p.type === 'kavling' && p.block === 'P').length === 0, 'grid: tanpa kavling perimeter')

section('Mix tipe rumah (lotTypes)')
const pMixT = defaultSiteplanParams()
pMixT.roadStyle = 'grid'
pMixT.lotTypes = [
  { name: 'T6', w: 6, pct: 60 },
  { name: 'T8', w: 8, pct: 40 },
]
const rMixT = generateSiteplan(SITEPLAN_PRESETS[0].coords, pMixT)
const widthsSeen = new Set(rMixT.parcels.filter(p => p.type === 'kavling').map(p => p.w))
assert(widthsSeen.has(6) && widthsSeen.has(8), 'dua lebar tipe hadir: ' + [...widthsSeen].join(','))

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

/* ---------- Parser DXF (viewer) ---------- */
const { parseDxf } = await import('../src/lib/dxf-view.ts')
section('parseDxf')
const dxfOut = buildDxf(generateSiteplan(SITEPLAN_PRESETS[0].coords, defaultSiteplanParams()))
const dxfParsed = parseDxf(dxfOut)
assert(dxfParsed.segments.length > 100, 'segmen terbaca dari DXF sendiri (' + dxfParsed.segments.length + ')')
assert(dxfParsed.texts.length > 10, 'label TEXT terbaca (' + dxfParsed.texts.length + ')')
assert(dxfParsed.bounds !== null, 'bounds terhitung')
// LINE + LWPOLYLINE + CIRCLE sederhana
const mini = ['0','SECTION','2','ENTITIES',
  '0','LINE','10','0','20','0','11','10','21','0',
  '0','LWPOLYLINE','90','3','70','1','10','0','20','0','10','5','20','5','10','0','20','5',
  '0','CIRCLE','10','2','20','2','40','1',
  '0','ENDSEC','0','EOF'].join('\n')
const miniParsed = parseDxf(mini)
assert(miniParsed.segments.length === 1 + 3 + 24, 'LINE+LWPOLYLINE tertutup+CIRCLE (' + miniParsed.segments.length + ')')

console.log('\nHasil:', passed, 'lulus,', failed, 'gagal')
process.exit(failed ? 1 : 0)
