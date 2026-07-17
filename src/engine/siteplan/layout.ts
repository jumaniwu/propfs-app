/**
 * Algoritma auto-layout siteplan (murni, tanpa DOM).
 * Bekerja di "frame kerja": boundary dirotasi sehingga sisi terpanjang
 * (frontage utama) horizontal di bawah, semua elemen dibangun dari persegi
 * axis-aligned lalu dirotasi kembali di akhir.
 */
import {
  type Point, type Rect, type BBox,
  ensureCCW, isSimplePolygon, longestEdgeAngle, centroid, rotatePoints,
  bbox, dist, polygonArea, clipPolyToRect, rectFullyInside, rectToPoly,
} from './geometry.ts'

export type ParcelType = 'kavling' | 'jalan' | 'rth' | 'fasum' | 'komersial' | 'tower' | 'parkir'

/**
 * Konsep pembangunan:
 * - perumahan: kavling rumah (+ opsi ruko di frontage)
 * - ruko: seluruh baris diisi ruko
 * - apartemen/hotel: tower di frontage + area parkir
 * - mixed: ruko di frontage + kavling rumah di belakang
 */
export type SiteplanConcept = 'perumahan' | 'ruko' | 'apartemen' | 'hotel' | 'mixed'

export interface Parcel {
  id: number
  type: ParcelType
  polygon: Point[]
  areaM2: number
  label: string | null
  block: string | null
  w: number | null
  d: number | null
}

export interface SiteplanParams {
  lot: { w: number; d: number }
  road: { main: number; secondary: number }
  rthPct: number
  fasumPct: number
  commercial: { enabled: boolean; w: number; d: number; maxCount: number }
  blockMaxLen: number
  /** Konsep pembangunan; default 'perumahan' (kompatibel dengan data lama). */
  concept?: SiteplanConcept
  /** Dimensi tower untuk konsep apartemen/hotel (dan mixed bila mixTower). */
  tower?: { w: number; d: number; count: number }
  /** Konsep mixed: sertakan tower apartemen di frontage (ruko + rumah + tower). */
  mixTower?: boolean
  /**
   * Index sisi boundary (setelah normalisasi CCW) yang menghadap jalan utama:
   * sisi i = titik i → titik i+1. Kosong = otomatis (sisi terpanjang).
   */
  frontageEdge?: number | null
}

export interface SiteplanStats {
  totalAreaM2: number
  counts: { kavling: number; komersial: number; tower: number }
  byType: Record<ParcelType, { area: number; pct: number }>
  efficiencyPct: number
}

export interface SiteplanResult {
  boundary: Point[]
  theta: number
  parcels: Parcel[]
  stats: SiteplanStats
  params: SiteplanParams
  warnings: string[]
}

interface Band {
  kind: 'road' | 'row'
  y1: number
  y2: number
  rowFacing?: 'down' | 'up'
  pairIndex: number
  first?: boolean
}

interface Cell {
  rect: Rect
  band: Band
  runEdge?: boolean
  bandIndex?: number
  block?: string
  label?: string
}

interface Strip { x1: number; x2: number }

const MIN_PARCEL_AREA = 1 // m² — sliver di bawah ini dibuang
const MIN_KAVLING_KEEP = 10 // fasum/RTH tidak memakan kavling hingga di bawah ini

export function defaultSiteplanParams(): SiteplanParams {
  return {
    lot: { w: 6, d: 12 },
    road: { main: 8, secondary: 6 },
    rthPct: 10,
    fasumPct: 5,
    commercial: { enabled: false, w: 5, d: 15, maxCount: 10 },
    blockMaxLen: 60,
    concept: 'perumahan',
    tower: { w: 20, d: 30, count: 1 },
  }
}

/* ---------------- Frame ---------------- */

function longestEdgeMidY(pts: Point[]): number {
  let bestLen = -1
  let midY = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = dist(a, b)
    if (len > bestLen) {
      bestLen = len
      midY = (a[1] + b[1]) / 2
    }
  }
  return midY
}

function computeFrame(boundary: Point[], frontageEdge?: number | null) {
  if (!boundary || boundary.length < 3) {
    throw new Error('Minimal 3 titik koordinat diperlukan.')
  }
  const pts = ensureCCW(boundary)
  if (!isSimplePolygon(pts)) {
    throw new Error('Polygon batas lahan saling berpotongan (self-intersecting). Periksa urutan titik.')
  }
  const origin = centroid(pts)

  if (frontageEdge != null && frontageEdge >= 0 && frontageEdge < pts.length) {
    // sisi pilihan user menjadi frontage; pada polygon CCW interior selalu di
    // kiri arah sisi, sehingga setelah dirotasi horizontal sisi ada di bawah
    const a = pts[frontageEdge]
    const b = pts[(frontageEdge + 1) % pts.length]
    const theta = Math.atan2(b[1] - a[1], b[0] - a[0])
    const rot = rotatePoints(pts, -theta, origin)
    return { theta, origin, rotBoundary: rot, bbox: bbox(rot) }
  }

  let theta = longestEdgeAngle(pts)
  let rot = rotatePoints(pts, -theta, origin)
  // pastikan sisi terpanjang berada di bawah (frontage utama = tepi bawah)
  const c = centroid(rot)
  if (longestEdgeMidY(rot) > c[1]) {
    theta += Math.PI
    rot = rotatePoints(pts, -theta, origin)
  }
  return { theta, origin, rotBoundary: rot, bbox: bbox(rot) }
}

/* ---------------- Band horizontal ---------------- */

function buildBands(bb: BBox, params: SiteplanParams, firstRowDepth: number | null): Band[] {
  const bands: Band[] = []
  const d = params.lot.d
  let y = bb.minY
  let pair = 0
  let first = true
  for (;;) {
    const rowD = first && firstRowDepth ? firstRowDepth : d
    // jalan di depan pasangan baris: frontage utama lebar penuh, sisanya jalan lingkungan
    const road = first ? params.road.main : params.road.secondary
    bands.push({ kind: 'road', y1: y, y2: y + road, pairIndex: pair })
    y += road
    if (y + rowD > bb.maxY) break
    bands.push({ kind: 'row', y1: y, y2: y + rowD, rowFacing: 'down', pairIndex: pair, first })
    y += rowD
    first = false
    if (y + d <= bb.maxY) {
      bands.push({ kind: 'row', y1: y, y2: y + d, rowFacing: 'up', pairIndex: pair })
      y += d
    }
    pair++
    if (y >= bb.maxY) break
  }
  // buang jalan menggantung di atas yang tidak melayani baris apa pun
  while (bands.length > 1 && bands[bands.length - 1].kind === 'road') bands.pop()
  return bands
}

/* ---------------- Jalan lingkungan vertikal ---------------- */

function crossRoadXs(bb: BBox, params: SiteplanParams): Strip[] {
  const strips: Strip[] = []
  const period = params.blockMaxLen + params.road.secondary
  const half = params.road.secondary / 2
  const cx = (bb.minX + bb.maxX) / 2
  const margin = params.lot.w
  const width = bb.maxX - bb.minX
  if (width <= params.blockMaxLen) return strips
  let k = 0
  for (;;) {
    let placed = false
    const offs = k === 0 ? [0] : [-k * period, k * period]
    for (const off of offs) {
      const x = cx + off
      if (x - half > bb.minX + margin && x + half < bb.maxX - margin) {
        strips.push({ x1: x - half, x2: x + half })
        placed = true
      }
    }
    if (!placed && k > 0) break
    k++
    if (k > 100) break
  }
  strips.sort((a, b) => a.x1 - b.x1)
  return strips
}

type Interval = [number, number]

function freeIntervals(bb: BBox, crossRoads: Strip[]): Interval[] {
  const iv: Interval[] = []
  let x = bb.minX
  for (const s of crossRoads) {
    if (s.x1 > x) iv.push([x, s.x1])
    x = Math.max(x, s.x2)
  }
  if (bb.maxX > x) iv.push([x, bb.maxX])
  return iv
}

/** intervals dikurangi daftar rentang [x1,x2] yang sudah terpakai. */
function subtractIntervals(intervals: Interval[], occupied: Interval[]): Interval[] {
  let out = intervals.slice()
  for (const oc of occupied) {
    const next: Interval[] = []
    for (const iv of out) {
      if (oc[1] <= iv[0] || oc[0] >= iv[1]) { next.push(iv); continue }
      if (oc[0] > iv[0]) next.push([iv[0], oc[0]])
      if (oc[1] < iv[1]) next.push([oc[1], iv[1]])
    }
    out = next
  }
  return out.filter(iv => iv[1] - iv[0] > 1e-6)
}

/* ---------------- Iris baris menjadi kavling ---------------- */

function markRunEdges(run: Cell[]): void {
  run[0].runEdge = true
  run[run.length - 1].runEdge = true
}

function pushRemnant(remnants: Point[][], rotBoundary: Point[], rect: Rect): void {
  const piece = clipPolyToRect(rotBoundary, rect)
  if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) {
    remnants.push(piece)
  }
}

function sliceRow(
  band: Band, intervals: Interval[], rotBoundary: Point[],
  dims: { w: number; d: number },
): { cells: Cell[]; remnants: Point[][] } {
  let cells: Cell[] = []
  const remnants: Point[][] = []
  for (const [a, b] of intervals) {
    let x = a
    let runCells: Cell[] = []
    while (x + dims.w <= b + 1e-9) {
      const rect: Rect = { x1: x, y1: band.y1, x2: x + dims.w, y2: band.y2 }
      if (rectFullyInside(rect, rotBoundary)) {
        runCells.push({ rect, band })
      } else {
        pushRemnant(remnants, rotBoundary, rect)
        if (runCells.length) {
          markRunEdges(runCells)
          cells = cells.concat(runCells)
          runCells = []
        }
      }
      x += dims.w
    }
    if (x < b) pushRemnant(remnants, rotBoundary, { x1: x, y1: band.y1, x2: b, y2: band.y2 })
    if (runCells.length) {
      markRunEdges(runCells)
      cells = cells.concat(runCells)
    }
  }
  return { cells, remnants }
}

/* ---------------- Fasum & RTH ---------------- */

function cellArea(cell: Cell): number {
  return (cell.rect.x2 - cell.rect.x1) * (cell.rect.y2 - cell.rect.y1)
}

function cellCenter(cell: Cell): Point {
  return [(cell.rect.x1 + cell.rect.x2) / 2, (cell.rect.y1 + cell.rect.y2) / 2]
}

/** Ambil deretan sel bersebelahan (band sama, x kontigu) di sekitar sel seed. */
function contiguousRun(cells: Cell[], seedIdx: number, needed: number): Cell[] {
  const seed = cells[seedIdx]
  const sameBand = cells.filter(c => c.band === seed.band)
  sameBand.sort((a, b) => a.rect.x1 - b.rect.x1)
  const pos = sameBand.indexOf(seed)
  const chosen: Cell[] = [seed]
  let lo = pos - 1
  let hi = pos + 1
  while (chosen.length < needed) {
    let extended = false
    if (hi < sameBand.length && Math.abs(sameBand[hi].rect.x1 - chosen[chosen.length - 1].rect.x2) < 1e-6) {
      chosen.push(sameBand[hi])
      hi++
      extended = true
    }
    if (chosen.length < needed && lo >= 0 && Math.abs(sameBand[lo].rect.x2 - chosen[0].rect.x1) < 1e-6) {
      chosen.unshift(sameBand[lo])
      lo--
      extended = true
    }
    if (!extended) break
  }
  return chosen
}

function mergeRunToRect(run: Cell[]): Rect {
  let x1 = Infinity
  let x2 = -Infinity
  for (const c of run) {
    x1 = Math.min(x1, c.rect.x1)
    x2 = Math.max(x2, c.rect.x2)
  }
  return { x1, y1: run[0].rect.y1, x2, y2: run[0].rect.y2 }
}

function groupAdjacent(cells: Cell[]): Cell[][] {
  const byBand = new Map<Band, Cell[]>()
  for (const c of cells) {
    const arr = byBand.get(c.band)
    if (arr) arr.push(c)
    else byBand.set(c.band, [c])
  }
  const groups: Cell[][] = []
  byBand.forEach(arr => {
    arr.sort((a, b) => a.rect.x1 - b.rect.x1)
    let cur = [arr[0]]
    for (let i = 1; i < arr.length; i++) {
      if (Math.abs(arr[i].rect.x1 - cur[cur.length - 1].rect.x2) < 1e-6) cur.push(arr[i])
      else { groups.push(cur); cur = [arr[i]] }
    }
    groups.push(cur)
  })
  return groups
}

type ProtoParcel = Pick<Parcel, 'type' | 'polygon' | 'label'>

/** Alokasi fasum lalu RTH dari sel kavling; remnant otomatis jadi RTH. */
function allocateFasumRth(
  cells: Cell[], remnants: Point[][], totalArea: number,
  params: SiteplanParams, warnings: string[],
): { fasum: ProtoParcel[]; rth: ProtoParcel[] } {
  const fasumParcels: ProtoParcel[] = []
  const rthPolys = remnants.slice()
  let rthArea = 0
  for (const p of rthPolys) rthArea += polygonArea(p)

  // --- Fasum: deretan sel kontigu terdekat pusat lahan ---
  const fasumTarget = (params.fasumPct / 100) * totalArea
  if (fasumTarget > 0 && cells.length > MIN_KAVLING_KEEP) {
    const center: Point = [0, 0]
    for (const c of cells) {
      const cc = cellCenter(c)
      center[0] += cc[0]
      center[1] += cc[1]
    }
    center[0] /= cells.length
    center[1] /= cells.length
    let seedIdx = 0
    let bestD = Infinity
    for (let s = 0; s < cells.length; s++) {
      const d = dist(cellCenter(cells[s]), center)
      if (d < bestD) { bestD = d; seedIdx = s }
    }
    let needed = Math.max(1, Math.ceil(fasumTarget / cellArea(cells[seedIdx])))
    needed = Math.min(needed, cells.length - MIN_KAVLING_KEEP)
    if (needed > 0) {
      const run = contiguousRun(cells, seedIdx, needed)
      const rect = mergeRunToRect(run)
      fasumParcels.push({ type: 'fasum', polygon: rectToPoly(rect), label: 'FASUM' })
      for (const r of run) cells.splice(cells.indexOf(r), 1)
      const got = (rect.x2 - rect.x1) * (rect.y2 - rect.y1)
      if (got < fasumTarget * 0.9) {
        warnings.push(`Target fasum ${params.fasumPct}% tidak sepenuhnya tercapai (${(got / totalArea * 100).toFixed(1)}%).`)
      }
    }
  }

  // --- RTH top-up: konversi sel prioritas sampai target ---
  const rthTarget = (params.rthPct / 100) * totalArea
  if (rthTarget > 0) {
    const candidates = cells.slice().sort((a, b) => {
      // prioritas: ujung deretan dulu, lalu band paling atas
      const ea = a.runEdge ? 0 : 1
      const eb = b.runEdge ? 0 : 1
      if (ea !== eb) return ea - eb
      return b.rect.y1 - a.rect.y1
    })
    const converted: Cell[] = []
    let ci = 0
    while (rthArea < rthTarget && ci < candidates.length && cells.length > MIN_KAVLING_KEEP) {
      const cell = candidates[ci++]
      const idx = cells.indexOf(cell)
      if (idx === -1) continue
      cells.splice(idx, 1)
      converted.push(cell)
      rthArea += cellArea(cell)
    }
    for (const g of groupAdjacent(converted)) {
      rthPolys.push(rectToPoly(mergeRunToRect(g)))
    }
    if (rthArea < rthTarget - 1e-6) {
      warnings.push(`Target RTH ${params.rthPct}% tidak sepenuhnya tercapai (${(rthArea / totalArea * 100).toFixed(1)}%) agar jumlah kavling tetap wajar.`)
    }
  }

  const rth: ProtoParcel[] = rthPolys.map(poly => ({ type: 'rth', polygon: poly, label: 'RTH' }))
  return { fasum: fasumParcels, rth }
}

/* ---------------- Statistik ---------------- */

function roadArea(rotBoundary: Point[], roadBands: Band[], crossRoads: Strip[], bb: BBox): number {
  let area = 0
  const hRects: Rect[] = roadBands.map(b => ({ x1: bb.minX, y1: b.y1, x2: bb.maxX, y2: b.y2 }))
  const vRects: Rect[] = crossRoads.map(s => ({ x1: s.x1, y1: bb.minY, x2: s.x2, y2: bb.maxY }))
  for (const r of hRects.concat(vRects)) {
    const piece = clipPolyToRect(rotBoundary, r)
    if (piece.length >= 3) area += polygonArea(piece)
  }
  // koreksi overlap H ∩ V (rect ∩ rect = rect)
  for (const h of hRects) {
    for (const v of vRects) {
      const ov: Rect = {
        x1: Math.max(h.x1, v.x1),
        y1: Math.max(h.y1, v.y1),
        x2: Math.min(h.x2, v.x2),
        y2: Math.min(h.y2, v.y2),
      }
      if (ov.x2 > ov.x1 && ov.y2 > ov.y1) {
        const op = clipPolyToRect(rotBoundary, ov)
        if (op.length >= 3) area -= polygonArea(op)
      }
    }
  }
  return area
}

/* ---------------- Pipeline utama ---------------- */

export function generateSiteplan(boundaryPts: Point[], inputParams: SiteplanParams): SiteplanResult {
  const warnings: string[] = []

  // params efektif per konsep (tanpa memutasi objek pemanggil)
  const concept: SiteplanConcept = inputParams.concept ?? 'perumahan'
  const isTower = concept === 'apartemen' || concept === 'hotel'
  const params: SiteplanParams = {
    ...inputParams,
    lot: { ...inputParams.lot },
    commercial: { ...inputParams.commercial },
    tower: { w: 20, d: 30, count: 1, ...inputParams.tower },
  }
  if (concept === 'mixed') params.commercial.enabled = true
  if (concept === 'ruko') {
    // seluruh baris memakai dimensi ruko
    params.lot = { w: params.commercial.w, d: params.commercial.d }
    params.commercial.enabled = false
  }
  if (isTower) {
    params.commercial.enabled = false
    params.fasumPct = 0 // fasum tidak relevan untuk tower tunggal
  }

  const frame = computeFrame(boundaryPts, params.frontageEdge)
  const rotB = frame.rotBoundary
  const bb = frame.bbox
  const totalArea = polygonArea(rotB)

  const minNeeded = isTower
    ? params.tower!.w * params.tower!.d
    : params.lot.w * params.lot.d
  if (totalArea < minNeeded * 4) {
    throw new Error(`Luas lahan terlalu kecil (${totalArea.toFixed(0)} m²) untuk konsep yang dipilih.`)
  }

  const com = params.commercial
  // mixed + tower: frontage berisi tower + ruko sekaligus
  const mixTower = concept === 'mixed' && params.mixTower === true && (params.tower?.count ?? 0) > 0
  const firstRowDepth = isTower
    ? params.tower!.d
    : mixTower
      ? Math.max(params.tower!.d, com.d > params.lot.d ? com.d : params.lot.d)
      : com.enabled && com.d > params.lot.d ? com.d : null
  const bands = buildBands(bb, params, firstRowDepth)
  // konsep tower: sirkulasi cukup jalan horizontal, tanpa jalan lingkungan vertikal
  const crossRoads = isTower ? [] : crossRoadXs(bb, params)
  const intervals = freeIntervals(bb, crossRoads)

  const parcels: Array<Omit<Parcel, 'id' | 'areaM2'> & Partial<Pick<Parcel, 'id' | 'areaM2'>>> = []

  const addParcel = (p: ProtoParcel & Partial<Pick<Parcel, 'block' | 'w' | 'd'>>) => {
    parcels.push({
      type: p.type,
      polygon: p.polygon,
      label: p.label ?? null,
      block: p.block ?? null,
      w: p.w ?? null,
      d: p.d ?? null,
    })
  }

  // --- Jalan ---
  const roadBands = bands.filter(b => b.kind === 'road')
  for (const band of roadBands) {
    const piece = clipPolyToRect(rotB, { x1: bb.minX, y1: band.y1, x2: bb.maxX, y2: band.y2 })
    if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) {
      addParcel({ type: 'jalan', polygon: piece, label: null })
    }
  }
  for (const s of crossRoads) {
    const piece = clipPolyToRect(rotB, { x1: s.x1, y1: bb.minY, x2: s.x2, y2: bb.maxY })
    if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) {
      addParcel({ type: 'jalan', polygon: piece, label: null })
    }
  }
  const jalanArea = roadArea(rotB, roadBands, crossRoads, bb)

  // --- Baris kavling & ruko (atau tower + parkir) ---
  const rowBands = bands.filter(b => b.kind === 'row')
  const allCells: Cell[] = []
  let allRemnants: Point[][] = []
  let comCells: Cell[] = []
  const towerParcels: ProtoParcel[] = []
  const parkirPolys: Point[][] = []

  if (isTower) {
    const tw = params.tower!
    rowBands.forEach(band => {
      if (band.first) {
        // tower berjajar di tengah frontage; kurangi jumlah bila tidak muat
        const gap = params.road.secondary
        const cx = (bb.minX + bb.maxX) / 2
        let placed: Rect[] = []
        for (let n = tw.count; n >= 1 && placed.length === 0; n--) {
          const total = n * tw.w + (n - 1) * gap
          const candidate: Rect[] = []
          for (let i = 0; i < n; i++) {
            const x1 = cx - total / 2 + i * (tw.w + gap)
            const rect: Rect = { x1, y1: band.y1, x2: x1 + tw.w, y2: band.y2 }
            if (rectFullyInside(rect, rotB)) candidate.push(rect)
          }
          if (candidate.length === n) placed = candidate
        }
        if (placed.length < tw.count) {
          warnings.push(`Hanya ${placed.length} dari ${tw.count} tower yang muat di lahan.`)
        }
        const towerName = concept === 'hotel' ? 'HOTEL' : 'TOWER'
        placed.forEach((rect, i) => {
          towerParcels.push({
            type: 'tower',
            polygon: rectToPoly(rect),
            label: placed.length > 1 ? `${towerName}-${i + 1}` : towerName,
          })
        })
        const rest = subtractIntervals(intervals, placed.map(r => [r.x1, r.x2] as Interval))
        for (const iv of rest) {
          const piece = clipPolyToRect(rotB, { x1: iv[0], y1: band.y1, x2: iv[1], y2: band.y2 })
          if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) parkirPolys.push(piece)
        }
      } else {
        for (const iv of intervals) {
          const piece = clipPolyToRect(rotB, { x1: iv[0], y1: band.y1, x2: iv[1], y2: band.y2 })
          if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) parkirPolys.push(piece)
        }
      }
    })
    if (towerParcels.length === 0) {
      throw new Error('Tower tidak muat di dalam batas lahan. Kecilkan dimensi tower.')
    }
  } else rowBands.forEach((band, bi) => {
    if (com.enabled && band.first && comCells.length < com.maxCount) {
      let bandIntervals = intervals
      // mixed + tower: tempatkan tower dulu di tengah frontage
      if (mixTower) {
        const tw = params.tower!
        const gap = params.road.secondary
        const cx = (bb.minX + bb.maxX) / 2
        let placed: Rect[] = []
        for (let n = tw.count; n >= 1 && placed.length === 0; n--) {
          const total = n * tw.w + (n - 1) * gap
          const candidate: Rect[] = []
          for (let i = 0; i < n; i++) {
            const x1 = cx - total / 2 + i * (tw.w + gap)
            const rect: Rect = { x1, y1: band.y1, x2: x1 + tw.w, y2: Math.min(band.y1 + tw.d, band.y2) }
            if (rectFullyInside(rect, rotB)) candidate.push(rect)
          }
          if (candidate.length === n) placed = candidate
        }
        if (placed.length < tw.count) {
          warnings.push(`Hanya ${placed.length} dari ${tw.count} tower yang muat di frontage.`)
        }
        placed.forEach((rect, i) => {
          towerParcels.push({
            type: 'tower',
            polygon: rectToPoly(rect),
            label: placed.length > 1 ? `TOWER-${i + 1}` : 'TOWER',
          })
          // strip di belakang tower (bila band lebih dalam) → parkir/servis
          if (band.y2 - rect.y2 > 0.01) {
            const piece = clipPolyToRect(rotB, { x1: rect.x1, y1: rect.y2, x2: rect.x2, y2: band.y2 })
            if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) parkirPolys.push(piece)
          }
        })
        bandIntervals = subtractIntervals(intervals, placed.map(r => [r.x1, r.x2] as Interval))
      }
      // baris frontage: iris dengan dimensi ruko dulu (dari kiri), sisanya kavling
      const rukoDepth = Math.min(com.d, band.y2 - band.y1)
      const rukoBand: Band = { ...band, y2: band.y1 + rukoDepth }
      const res = sliceRow(rukoBand, bandIntervals, rotB, { w: com.w, d: rukoDepth })
      const take = Math.min(com.maxCount, res.cells.length)
      comCells = res.cells.slice(0, take)
      // strip di belakang deretan ruko (band lebih dalam karena tower) → parkir
      if (band.y2 - rukoBand.y2 > 0.01) {
        for (const iv of bandIntervals) {
          const piece = clipPolyToRect(rotB, { x1: iv[0], y1: rukoBand.y2, x2: iv[1], y2: band.y2 })
          if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) parkirPolys.push(piece)
        }
      }
      const occupied: Interval[] = comCells.map(c => [c.rect.x1, c.rect.x2])
      const restIntervals = subtractIntervals(bandIntervals, occupied)
      const res2 = sliceRow(rukoBand, restIntervals, rotB, { w: params.lot.w, d: rukoDepth })
      for (const c of res2.cells) { c.bandIndex = bi; allCells.push(c) }
      allRemnants = allRemnants.concat(res2.remnants)
    } else {
      const r = sliceRow(band, intervals, rotB, { w: params.lot.w, d: band.y2 - band.y1 })
      for (const c of r.cells) { c.bandIndex = bi; allCells.push(c) }
      allRemnants = allRemnants.concat(r.remnants)
    }
  })

  // sisa lahan di atas band terakhir (tidak muat satu baris pun) → remnant/RTH
  const topY = bands.length ? bands[bands.length - 1].y2 : bb.minY
  if (bb.maxY - topY > 0.01) {
    for (const iv of intervals) {
      pushRemnant(allRemnants, rotB, { x1: iv[0], y1: topY, x2: iv[1], y2: bb.maxY })
    }
  }

  if (!isTower && allCells.length === 0 && comCells.length === 0) {
    throw new Error('Tidak ada kavling yang muat di dalam batas lahan. Coba kecilkan ukuran kavling atau lebar jalan.')
  }

  // --- Fasum & RTH ---
  let alloc: { fasum: ProtoParcel[]; rth: ProtoParcel[] }
  if (isTower) {
    // RTH = remnant + konversi petak parkir teratas sampai target terpenuhi
    const rthPolys = allRemnants.slice()
    let rthArea = rthPolys.reduce((s, p) => s + polygonArea(p), 0)
    const rthTarget = (params.rthPct / 100) * totalArea
    while (rthArea < rthTarget && parkirPolys.length > 1) {
      const piece = parkirPolys.pop()!
      rthPolys.push(piece)
      rthArea += polygonArea(piece)
    }
    if (rthArea < rthTarget - 1e-6) {
      warnings.push(`Target RTH ${params.rthPct}% tidak sepenuhnya tercapai (${(rthArea / totalArea * 100).toFixed(1)}%).`)
    }
    alloc = { fasum: [], rth: rthPolys.map(poly => ({ type: 'rth', polygon: poly, label: 'RTH' })) }
  } else {
    alloc = allocateFasumRth(allCells, allRemnants, totalArea, params, warnings)
  }

  // --- Penomoran ---
  const blocks = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const byPair = new Map<number, Cell[]>()
  for (const c of allCells) {
    const arr = byPair.get(c.band.pairIndex)
    if (arr) arr.push(c)
    else byPair.set(c.band.pairIndex, [c])
  }
  const pairKeys = Array.from(byPair.keys()).sort((a, b) => a - b)
  pairKeys.forEach((pk, i) => {
    const letter = blocks[i % blocks.length]
    const arr = byPair.get(pk)!
    arr.sort((a, b) => {
      if (Math.abs(a.rect.y1 - b.rect.y1) > 1e-6) return a.rect.y1 - b.rect.y1
      return a.rect.x1 - b.rect.x1
    })
    arr.forEach((c, j) => {
      c.block = letter
      c.label = `${letter}-${String(j + 1).padStart(2, '0')}`
    })
  })
  comCells.forEach((c, i) => { c.label = `R-${String(i + 1).padStart(2, '0')}` })

  // konsep 'ruko': semua unit hasil irisan adalah ruko (komersial)
  const rowLotType: ParcelType = concept === 'ruko' ? 'komersial' : 'kavling'
  for (const c of allCells) {
    addParcel({
      type: rowLotType, polygon: rectToPoly(c.rect), label: c.label!, block: c.block!,
      w: +(c.rect.x2 - c.rect.x1).toFixed(2), d: +(c.rect.y2 - c.rect.y1).toFixed(2),
    })
  }
  for (const c of comCells) {
    addParcel({
      type: 'komersial', polygon: rectToPoly(c.rect), label: c.label!, block: 'R',
      w: +(c.rect.x2 - c.rect.x1).toFixed(2), d: +(c.rect.y2 - c.rect.y1).toFixed(2),
    })
  }
  for (const p of towerParcels) addParcel(p)
  for (const poly of parkirPolys) addParcel({ type: 'parkir', polygon: poly, label: 'PARKIR' })
  for (const p of alloc.fasum) addParcel(p)
  for (const p of alloc.rth) addParcel(p)

  // --- Luas, id, rotasi kembali ke koordinat dunia ---
  const finalParcels: Parcel[] = parcels.map((p, i) => ({
    id: i + 1,
    type: p.type,
    polygon: rotatePoints(p.polygon, frame.theta, frame.origin),
    areaM2: +polygonArea(p.polygon).toFixed(2),
    label: p.label,
    block: p.block,
    w: p.w,
    d: p.d,
  }))

  // --- Statistik ---
  const byTypeArea: Record<ParcelType, number> = {
    kavling: 0, jalan: 0, rth: 0, fasum: 0, komersial: 0, tower: 0, parkir: 0,
  }
  const counts = { kavling: 0, komersial: 0, tower: 0 }
  for (const p of finalParcels) {
    if (p.type === 'jalan') continue // jalan dihitung dari jalanArea (koreksi overlap)
    byTypeArea[p.type] += p.areaM2
    if (p.type === 'kavling') counts.kavling++
    if (p.type === 'komersial') counts.komersial++
    if (p.type === 'tower') counts.tower++
  }
  byTypeArea.jalan = jalanArea

  const byType = {} as SiteplanStats['byType']
  ;(Object.keys(byTypeArea) as ParcelType[]).forEach(t => {
    byType[t] = {
      area: +byTypeArea[t].toFixed(2),
      pct: +(byTypeArea[t] / totalArea * 100).toFixed(2),
    }
  })
  const stats: SiteplanStats = {
    totalAreaM2: +totalArea.toFixed(2),
    counts,
    byType,
    efficiencyPct: +((byTypeArea.kavling + byTypeArea.komersial + byTypeArea.tower) / totalArea * 100).toFixed(2),
  }

  const sumPct = (Object.keys(stats.byType) as ParcelType[]).reduce((s, t) => s + stats.byType[t].pct, 0)
  if (sumPct < 96 || sumPct > 104) {
    warnings.push(`Cek internal: total persentase penggunaan lahan ${sumPct.toFixed(1)}% (ada sisa lahan yang tidak teralokasi).`)
  }

  return {
    boundary: ensureCCW(boundaryPts),
    theta: frame.theta,
    parcels: finalParcels,
    stats,
    params,
    warnings,
  }
}
