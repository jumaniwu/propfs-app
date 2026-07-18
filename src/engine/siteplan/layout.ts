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
  offsetPolygonInward, polyFullyInside, polysOverlap,
} from './geometry.ts'

export type ParcelType = 'kavling' | 'jalan' | 'rth' | 'fasum' | 'komersial' | 'tower' | 'parkir' | 'plaza'

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
  lot: { w: number; d: number; maxCount?: number }
  road: { main: number; secondary: number }
  rthPct: number
  fasumPct: number
  commercial: { enabled: boolean; w: number; d: number; maxCount: number }
  blockMaxLen: number
  /** Konsep pembangunan; default 'perumahan' (kompatibel dengan data lama). */
  concept?: SiteplanConcept
  /** Dimensi tower untuk konsep apartemen/hotel (dan mixed bila mixTower). */
  tower?: { w: number; d: number; count: number }
  /** Konsep mixed (lama): sertakan tower apartemen di frontage. Dipertahankan untuk kompatibilitas. */
  mixTower?: boolean
  /** Konsep mixed: pilihan komponen yang disertakan. Default {rumah,ruko}=true. */
  mix?: { rumah: boolean; ruko: boolean; tower: boolean; plaza: boolean }
  /** Dimensi blok foodcourt/commercial plaza untuk komponen mixed. */
  plaza?: { w: number; d: number }
  /**
   * Index sisi boundary (setelah normalisasi CCW) yang menghadap jalan utama:
   * sisi i = titik i → titik i+1. Kosong = otomatis (sisi terpanjang).
   */
  frontageEdge?: number | null
  /** Pola jaringan jalan: 'loop' = boulevard + jalan keliling ikut bentuk lahan (default), 'grid' = pola lama. */
  roadStyle?: 'grid' | 'loop'
  /** Posisi gerbang di sisi jalan utama, 0..1 sepanjang sisi frontage (default 0.5). */
  gateT?: number
  /** Lebar buffer hijau keliling batas lahan (m), default 3. */
  perimeterBuffer?: number
  /** Mix tipe rumah: beberapa lebar kavling dengan proporsi % (kedalaman seragam lot.d). */
  lotTypes?: Array<{ name: string; w: number; pct: number }>
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
    plaza: { w: 30, d: 20 },
    roadStyle: 'loop',
    gateT: 0.5,
    perimeterBuffer: 3,
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

function buildBands(
  bb: BBox, params: SiteplanParams, firstRowDepth: number | null,
  opts?: { startWithRow?: boolean; allSecondary?: boolean },
): Band[] {
  const bands: Band[] = []
  const d = params.lot.d
  let y = bb.minY
  let pair = 0
  let first = true
  // gaya loop: baris pertama langsung menghadap ring road di bawahnya
  if (opts?.startWithRow) {
    const rowD = firstRowDepth ?? d
    if (y + rowD <= bb.maxY) {
      bands.push({ kind: 'row', y1: y, y2: y + rowD, rowFacing: 'down', pairIndex: pair, first: true })
      y += rowD
      first = false
      if (y + d <= bb.maxY) {
        bands.push({ kind: 'row', y1: y, y2: y + d, rowFacing: 'up', pairIndex: pair })
        y += d
      }
      pair++
    }
  }
  for (;;) {
    const rowD = first && firstRowDepth ? firstRowDepth : d
    // jalan di depan pasangan baris: frontage utama lebar penuh, sisanya jalan lingkungan
    const road = first && !opts?.allSecondary ? params.road.main : params.road.secondary
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
  dims: { w: number; d: number; widths?: number[] },
): { cells: Cell[]; remnants: Point[][] } {
  let cells: Cell[] = []
  const remnants: Point[][] = []
  const seq = dims.widths && dims.widths.length ? dims.widths : [dims.w]
  let wi = 0
  for (const [a, b] of intervals) {
    let x = a
    let runCells: Cell[] = []
    for (;;) {
      const w = seq[wi % seq.length]
      if (x + w > b + 1e-9) break
      const rect: Rect = { x1: x, y1: band.y1, x2: x + w, y2: band.y2 }
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
      x += w
      wi++
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
  params: SiteplanParams, warnings: string[], anchor: Point | null = null,
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
    const target = anchor ?? center
    let seedIdx = 0
    let bestD = Infinity
    for (let sIdx = 0; sIdx < cells.length; sIdx++) {
      const d = dist(cellCenter(cells[sIdx]), target)
      if (d < bestD) { bestD = d; seedIdx = sIdx }
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

/* ---------------- Gaya jalan LOOP (kerangka arsitek) ---------------- */

interface PerimLot { poly: Point[]; w: number; d: number }

interface LoopSkeleton {
  /** region inti (di dalam ring road) untuk pipeline grid */
  inner: Point[]
  jalan: Point[][]
  rth: Point[][]
  housing: PerimLot[]
  ruko: PerimLot[]
  roadAreaExtra: number
  gate: Point
}

/** Deret lebar kavling dari mix tipe (interleave proporsional). */
function buildWidthSeq(params: SiteplanParams): number[] {
  const types = params.lotTypes?.filter(t => t.w >= 3 && t.pct > 0) ?? []
  if (types.length === 0) return [params.lot.w]
  const total = types.reduce((sum, t) => sum + t.pct, 0)
  const rem = types.map(t => Math.max(1, Math.round((t.pct / total) * 10)))
  const seq: number[] = []
  while (rem.some(c => c > 0)) {
    for (let i = 0; i < types.length; i++) {
      if (rem[i] > 0) { seq.push(types[i].w); rem[i]-- }
    }
  }
  return seq
}

/**
 * Kerangka desain ala arsitek: buffer hijau keliling, gerbang + boulevard
 * bermedian dari jalan utama, jalan kolektor keliling (ring) mengikuti
 * bentuk lahan, kavling premium menghadap ring, ruko di frontage dekat
 * gerbang. Mengembalikan null bila bentuk/luas lahan tidak memungkinkan.
 */
function buildLoopSkeleton(
  rotB: Point[], params: SiteplanParams, widths: number[],
  opts: { rukoOn: boolean; housingOn: boolean },
): LoopSkeleton | null {
  const buffer = Math.max(1, params.perimeterBuffer ?? 3)
  const com = params.commercial
  const perimDepth = Math.max(params.lot.d, opts.rukoOn ? com.d : 0)
  const ringW = params.road.secondary
  const eff = offsetPolygonInward(rotB, buffer)
  const ringOuter = offsetPolygonInward(rotB, buffer + perimDepth)
  const ringInner = offsetPolygonInward(rotB, buffer + perimDepth + ringW)
  if (!eff || !ringOuter || !ringInner) return null
  // inti harus cukup untuk minimal ~2 baris kavling
  if (polygonArea(ringInner) < params.lot.w * params.lot.d * 8) return null

  const n = rotB.length
  // sisi frontage = sisi dengan titik tengah paling bawah pada frame kerja
  let frontIdx = 0
  let bestY = Infinity
  for (let i = 0; i < n; i++) {
    const my = (rotB[i][1] + rotB[(i + 1) % n][1]) / 2
    if (my < bestY) { bestY = my; frontIdx = i }
  }
  const gateT = Math.min(0.9, Math.max(0.1, params.gateT ?? 0.5))
  const fa = eff[frontIdx]
  const fb = eff[(frontIdx + 1) % n]
  const gx = fa[0] + (fb[0] - fa[0]) * gateT
  const bbAll = bbox(rotB)
  const bw = params.road.main
  const yRing = bbox(ringInner).minY + 1

  const jalan: Point[][] = []
  const rth: Point[][] = []
  let roadAreaExtra = 0

  // boulevard masuk dari gerbang menembus buffer + baris perimeter + ring
  const bvdRect: Rect = { x1: gx - bw / 2, y1: bbAll.minY, x2: gx + bw / 2, y2: yRing }
  const bvd = clipPolyToRect(rotB, bvdRect)
  const bvdPoly = rectToPoly(bvdRect)
  if (bvd.length < 3) return null
  jalan.push(bvd)
  roadAreaExtra += polygonArea(bvd)
  // median hijau boulevard (bila boulevard cukup lebar)
  if (bw >= 9) {
    const med = clipPolyToRect(rotB, { x1: gx - 0.75, y1: bbAll.minY + buffer + 4, x2: gx + 0.75, y2: yRing - 5 })
    if (med.length >= 3) {
      rth.push(med)
      roadAreaExtra -= polygonArea(med)
    }
  }

  // ring road + buffer keliling (per sisi, quad demi quad)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ringQuad: Point[] = [ringOuter[i], ringOuter[j], ringInner[j], ringInner[i]]
    jalan.push(ringQuad)
    roadAreaExtra += polygonArea(ringQuad)
    const bufQuad: Point[] = [rotB[i], rotB[j], eff[j], eff[i]]
    if (i === frontIdx) {
      // sisakan celah gerbang pada buffer frontage
      const bq = bbox(bufQuad)
      const left = clipPolyToRect(bufQuad, { x1: bq.minX, y1: bq.minY, x2: gx - bw / 2, y2: bq.maxY })
      const right = clipPolyToRect(bufQuad, { x1: gx + bw / 2, y1: bq.minY, x2: bq.maxX, y2: bq.maxY })
      if (left.length >= 3) rth.push(left)
      if (right.length >= 3) rth.push(right)
    } else {
      rth.push(bufQuad)
    }
  }
  // koreksi perkiraan overlap boulevard dengan ring bawah
  roadAreaExtra -= bw * ringW

  // kavling premium & ruko menghadap ring, per sisi polygon efektif
  const housing: PerimLot[] = []
  const ruko: PerimLot[] = []
  const placed: Point[][] = []
  let rukoLeft = opts.rukoOn ? com.maxCount : 0
  const shrinkQuad = (q: Point[], e: number): Point[] => {
    const c = centroid(q)
    return q.map(pt => {
      const dx = c[0] - pt[0]
      const dy = c[1] - pt[1]
      const len = Math.hypot(dx, dy) || 1
      return [pt[0] + (dx / len) * e, pt[1] + (dy / len) * e] as Point
    })
  }
  for (let i = 0; i < n; i++) {
    const isFront = i === frontIdx
    if (!isFront && !opts.housingOn) continue
    if (isFront && !opts.rukoOn && !opts.housingOn) continue
    const a = eff[i]
    const b = eff[(i + 1) % n]
    const len = dist(a, b)
    const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const nrm: Point = [-u[1], u[0]] // interior di kiri arah sisi (CCW)
    const cornerM = perimDepth * 0.8
    let sPos = cornerM
    let wi = 0
    while (sPos + 3 < len - cornerM) {
      const useRuko = isFront && rukoLeft > 0
      if (isFront && !useRuko && !opts.housingOn) break
      const w = useRuko ? com.w : widths[wi % widths.length]
      const d = useRuko ? com.d : perimDepth
      if (sPos + w > len - cornerM) break
      const o1: Point = [a[0] + u[0] * sPos, a[1] + u[1] * sPos]
      const o2: Point = [a[0] + u[0] * (sPos + w), a[1] + u[1] * (sPos + w)]
      const i2: Point = [o2[0] + nrm[0] * d, o2[1] + nrm[1] * d]
      const i1: Point = [o1[0] + nrm[0] * d, o1[1] + nrm[1] * d]
      const quad: Point[] = [o1, o2, i2, i1]
      const probe = shrinkQuad(quad, 0.05)
      const ok = polyFullyInside(quad, rotB, 0.005) &&
        !polysOverlap(probe, bvdPoly) &&
        !placed.some(pq => polysOverlap(probe, pq))
      if (ok) {
        placed.push(quad)
        if (useRuko) { ruko.push({ poly: quad, w, d }); rukoLeft-- }
        else housing.push({ poly: quad, w, d })
      }
      sPos += w
      if (!useRuko) wi++
    }
  }

  // taman sudut: isi wedge kosong di ujung tiap sisi (margin sudut) sebagai RTH
  const cornerPlaced: Point[][] = []
  for (let i = 0; i < n; i++) {
    const a = eff[i]
    const b = eff[(i + 1) % n]
    const len = dist(a, b)
    const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const nrm: Point = [-u[1], u[0]]
    const cornerM = Math.min(perimDepth * 0.8, len / 2 - 0.5)
    if (cornerM < 1) continue
    for (const [s0, s1] of [[0, cornerM], [len - cornerM, len]] as Array<[number, number]>) {
      const o1: Point = [a[0] + u[0] * s0, a[1] + u[1] * s0]
      const o2: Point = [a[0] + u[0] * s1, a[1] + u[1] * s1]
      const i2: Point = [o2[0] + nrm[0] * perimDepth, o2[1] + nrm[1] * perimDepth]
      const i1: Point = [o1[0] + nrm[0] * perimDepth, o1[1] + nrm[1] * perimDepth]
      const quad: Point[] = [o1, o2, i2, i1]
      const probe = shrinkQuad(quad, 0.08)
      if (!polyFullyInside(quad, rotB, 0.005)) continue
      if (polysOverlap(probe, bvdPoly)) continue
      if (placed.some(pq => polysOverlap(probe, pq))) continue
      if (cornerPlaced.some(pq => polysOverlap(probe, pq))) continue
      cornerPlaced.push(quad)
      rth.push(quad)
    }
  }

  return {
    inner: ringInner,
    jalan,
    rth,
    housing,
    ruko,
    roadAreaExtra,
    gate: [gx, bbAll.minY + buffer],
  }
}

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
    plaza: { w: 30, d: 20, ...inputParams.plaza },
  }
  // konfigurasi komponen mixed (kompatibel param lama mixTower)
  const mix = concept === 'mixed'
    ? {
        rumah: inputParams.mix?.rumah ?? true,
        ruko: inputParams.mix?.ruko ?? true,
        tower: inputParams.mix?.tower ?? inputParams.mixTower === true,
        plaza: inputParams.mix?.plaza ?? false,
      }
    : null
  if (mix && !mix.rumah && !mix.ruko && !mix.tower && !mix.plaza) {
    throw new Error('Pilih minimal satu komponen Mixed-Use (rumah/ruko/tower/plaza).')
  }
  if (concept === 'mixed') params.commercial.enabled = mix!.ruko
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

  // ===== Gaya jalan: loop keliling (ala arsitek) vs grid =====
  const styleWanted: 'grid' | 'loop' = isTower ? 'grid' : (params.roadStyle ?? 'loop')
  const lotWidths = buildWidthSeq(params)
  let loop: LoopSkeleton | null = null
  let gRegion = rotB
  let gbb = bb
  if (styleWanted === 'loop') {
    const rukoOn = concept === 'mixed' ? mix!.ruko : (com.enabled && concept !== 'ruko')
    const housingOn = concept === 'mixed' ? mix!.rumah : true
    loop = buildLoopSkeleton(rotB, params, lotWidths, { rukoOn, housingOn })
    if (loop) {
      gRegion = loop.inner
      gbb = bbox(loop.inner)
      // ruko sudah ditempatkan di frontage perimeter; inti fokus hunian/blok besar
      com.enabled = false
      if (mix) mix.ruko = false
    } else {
      warnings.push('Bentuk/luas lahan tidak memungkinkan jalan keliling — memakai pola grid.')
    }
  }

  // mixed: kedalaman baris frontage = komponen terdalam yang dipilih
  let firstRowDepth: number | null = null
  if (isTower) {
    firstRowDepth = params.tower!.d
  } else if (mix) {
    const depths = [params.lot.d]
    if (mix.ruko) depths.push(com.d)
    if (mix.tower && (params.tower?.count ?? 0) > 0) depths.push(params.tower!.d)
    if (mix.plaza) depths.push(params.plaza!.d)
    const maxD = Math.max(...depths)
    firstRowDepth = maxD > params.lot.d ? maxD : null
  } else if (com.enabled && com.d > params.lot.d) {
    firstRowDepth = com.d
  }
  const bands = buildBands(gbb, params, firstRowDepth,
    loop ? { startWithRow: true, allSecondary: true } : undefined)
  // konsep tower: sirkulasi cukup jalan horizontal, tanpa jalan lingkungan vertikal
  const crossRoads = isTower ? [] : crossRoadXs(gbb, params)
  const intervals = freeIntervals(gbb, crossRoads)

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
    const piece = clipPolyToRect(gRegion, { x1: gbb.minX, y1: band.y1, x2: gbb.maxX, y2: band.y2 })
    if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) {
      addParcel({ type: 'jalan', polygon: piece, label: null })
    }
  }
  for (const s of crossRoads) {
    const piece = clipPolyToRect(gRegion, { x1: s.x1, y1: gbb.minY, x2: s.x2, y2: gbb.maxY })
    if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) {
      addParcel({ type: 'jalan', polygon: piece, label: null })
    }
  }
  const jalanArea = roadArea(gRegion, roadBands, crossRoads, gbb) + (loop?.roadAreaExtra ?? 0)
  if (loop) for (const poly of loop.jalan) addParcel({ type: 'jalan', polygon: poly, label: null })

  // --- Baris kavling & ruko (atau tower + parkir) ---
  const rowBands = bands.filter(b => b.kind === 'row')
  const allCells: Cell[] = []
  let allRemnants: Point[][] = []
  let comCells: Cell[] = []
  const towerParcels: ProtoParcel[] = []
  const plazaParcels: ProtoParcel[] = []
  const parkirPolys: Point[][] = []

  if (isTower) {
    const tw = params.tower!
    rowBands.forEach(band => {
      if (band.first) {
        // tower berjajar di tengah frontage; kurangi jumlah bila tidak muat
        const gap = params.road.secondary
        const cx = (gbb.minX + gbb.maxX) / 2
        let placed: Rect[] = []
        for (let n = tw.count; n >= 1 && placed.length === 0; n--) {
          const total = n * tw.w + (n - 1) * gap
          const candidate: Rect[] = []
          for (let i = 0; i < n; i++) {
            const x1 = cx - total / 2 + i * (tw.w + gap)
            const rect: Rect = { x1, y1: band.y1, x2: x1 + tw.w, y2: band.y2 }
            if (rectFullyInside(rect, gRegion)) candidate.push(rect)
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
          const piece = clipPolyToRect(gRegion, { x1: iv[0], y1: band.y1, x2: iv[1], y2: band.y2 })
          if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) parkirPolys.push(piece)
        }
      } else {
        for (const iv of intervals) {
          const piece = clipPolyToRect(gRegion, { x1: iv[0], y1: band.y1, x2: iv[1], y2: band.y2 })
          if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) parkirPolys.push(piece)
        }
      }
    })
    if (towerParcels.length === 0) {
      throw new Error('Tower tidak muat di dalam batas lahan. Kecilkan dimensi tower.')
    }
  } else rowBands.forEach((band, bi) => {
    const pushParkirStrip = (x1: number, y1: number, x2: number, y2: number) => {
      if (y2 - y1 <= 0.01 || x2 - x1 <= 0.01) return
      const piece = clipPolyToRect(gRegion, { x1, y1, x2, y2 })
      if (piece.length >= 3 && polygonArea(piece) > MIN_PARCEL_AREA) parkirPolys.push(piece)
    }

    if (mix && band.first) {
      // ===== frontage mixed: blok besar (tower/plaza) + ruko + rumah =====
      let bandIntervals = intervals
      const bigBlocks: Array<{ w: number; d: number; type: 'tower' | 'plaza'; label: string }> = []
      if (mix.tower && (params.tower?.count ?? 0) > 0) {
        const tw = params.tower!
        for (let i = 0; i < tw.count; i++) {
          bigBlocks.push({ w: tw.w, d: tw.d, type: 'tower', label: tw.count > 1 ? `TOWER-${i + 1}` : 'TOWER' })
        }
      }
      if (mix.plaza) {
        const pz = params.plaza!
        bigBlocks.push({ w: pz.w, d: pz.d, type: 'plaza', label: 'PLAZA' })
      }
      if (bigBlocks.length) {
        // tiap blok mencari posisi muat terdekat dari tengah frontage (greedy),
        // sehingga di lahan miring/tidak beraturan blok tetap terpasang semua
        const gap = params.road.secondary
        const cx = (gbb.minX + gbb.maxX) / 2
        const step = Math.max(2, params.lot.w / 2)
        const placedRects: Rect[] = []
        let placedCount = 0
        for (const b of bigBlocks) {
          let placedRect: Rect | null = null
          for (let k = 0; k <= 400 && !placedRect; k++) {
            for (const sign of k === 0 ? [1] : [-1, 1]) {
              const x1 = cx - b.w / 2 + sign * k * step
              const rect: Rect = { x1, y1: band.y1, x2: x1 + b.w, y2: Math.min(band.y1 + b.d, band.y2) }
              if (rect.x1 < gbb.minX || rect.x2 > gbb.maxX) continue
              if (!rectFullyInside(rect, gRegion)) continue
              if (placedRects.some(r => rect.x1 < r.x2 + gap && rect.x2 > r.x1 - gap)) continue
              placedRect = rect
              break
            }
          }
          if (!placedRect) continue
          placedRects.push(placedRect)
          placedCount++
          const proto: ProtoParcel = { type: b.type, polygon: rectToPoly(placedRect), label: b.label }
          if (b.type === 'tower') towerParcels.push(proto)
          else plazaParcels.push(proto)
          pushParkirStrip(placedRect.x1, placedRect.y2, placedRect.x2, band.y2)
        }
        if (placedCount < bigBlocks.length) {
          warnings.push(`Hanya ${placedCount} dari ${bigBlocks.length} blok besar (tower/plaza) yang muat di frontage.`)
        }
        bandIntervals = subtractIntervals(intervals, placedRects.map(r => [r.x1, r.x2] as Interval))
      }
      if (mix.ruko) {
        const rukoDepth = Math.min(com.d, band.y2 - band.y1)
        const rukoBand: Band = { ...band, y2: band.y1 + rukoDepth }
        const res = sliceRow(rukoBand, bandIntervals, gRegion, { w: com.w, d: rukoDepth })
        const take = Math.min(com.maxCount, res.cells.length)
        comCells = res.cells.slice(0, take)
        for (const iv of bandIntervals) pushParkirStrip(iv[0], rukoBand.y2, iv[1], band.y2)
        const restIntervals = subtractIntervals(bandIntervals, comCells.map(c => [c.rect.x1, c.rect.x2] as Interval))
        if (mix.rumah) {
          const res2 = sliceRow(rukoBand, restIntervals, gRegion, { w: params.lot.w, d: rukoDepth, widths: lotWidths })
          for (const c of res2.cells) { c.bandIndex = bi; allCells.push(c) }
          allRemnants = allRemnants.concat(res2.remnants)
        } else {
          for (const iv of restIntervals) pushParkirStrip(iv[0], rukoBand.y1, iv[1], rukoBand.y2)
        }
      } else if (mix.rumah) {
        const rowDepth = Math.min(params.lot.d, band.y2 - band.y1)
        const rowBand: Band = { ...band, y2: band.y1 + rowDepth }
        const r = sliceRow(rowBand, bandIntervals, gRegion, { w: params.lot.w, d: rowDepth, widths: lotWidths })
        for (const c of r.cells) { c.bandIndex = bi; allCells.push(c) }
        allRemnants = allRemnants.concat(r.remnants)
        for (const iv of bandIntervals) pushParkirStrip(iv[0], rowBand.y2, iv[1], band.y2)
      } else {
        // hanya tower/plaza: sisa frontage jadi parkir
        for (const iv of bandIntervals) pushParkirStrip(iv[0], band.y1, iv[1], band.y2)
      }
    } else if (mix && !mix.rumah) {
      // ===== mixed tanpa rumah: baris belakang menjadi parkir =====
      for (const iv of intervals) pushParkirStrip(iv[0], band.y1, iv[1], band.y2)
    } else if (com.enabled && band.first && comCells.length < com.maxCount) {
      // baris frontage (perumahan + opsi ruko): iris ruko dulu, sisanya kavling
      const res = sliceRow(band, intervals, gRegion, { w: com.w, d: band.y2 - band.y1 })
      const take = Math.min(com.maxCount, res.cells.length)
      comCells = res.cells.slice(0, take)
      const occupied: Interval[] = comCells.map(c => [c.rect.x1, c.rect.x2])
      const restIntervals = subtractIntervals(intervals, occupied)
      const res2 = sliceRow(band, restIntervals, gRegion, { w: params.lot.w, d: band.y2 - band.y1, widths: lotWidths })
      for (const c of res2.cells) { c.bandIndex = bi; allCells.push(c) }
      allRemnants = allRemnants.concat(res2.remnants)
    } else {
      const r = sliceRow(band, intervals, gRegion, { w: params.lot.w, d: band.y2 - band.y1, widths: lotWidths })
      for (const c of r.cells) { c.bandIndex = bi; allCells.push(c) }
      allRemnants = allRemnants.concat(r.remnants)
    }
  })

  // blok besar wajib hadir: bila tidak muat di inti loop, ulang dengan pola grid
  const wantTower = (isTower || (mix?.tower ?? false)) && (params.tower?.count ?? 0) > 0
  const wantPlaza = mix?.plaza ?? false
  if (loop && ((wantTower && towerParcels.length === 0) || (wantPlaza && plazaParcels.length === 0))) {
    const retry = generateSiteplan(boundaryPts, { ...inputParams, roadStyle: 'grid' })
    retry.warnings.push('Blok tower/plaza tidak muat di inti jalan keliling — otomatis memakai pola grid.')
    return retry
  }

  // sisa lahan di atas band terakhir (tidak muat satu baris pun) → remnant/RTH
  const topY = bands.length ? bands[bands.length - 1].y2 : gbb.minY
  if (gbb.maxY - topY > 0.01) {
    for (const iv of intervals) {
      pushRemnant(allRemnants, gRegion, { x1: iv[0], y1: topY, x2: iv[1], y2: gbb.maxY })
    }
  }

  // batas jumlah rumah (target unit dari kebutuhan/AI): kelebihan → RTH
  const lotMax = params.lot.maxCount ?? 0
  if (lotMax > 0) {
    if (loop && loop.housing.length > lotMax) {
      for (const q of loop.housing.splice(lotMax)) allRemnants.push(q.poly)
    }
    const coreAllowed = Math.max(0, lotMax - (loop?.housing.length ?? 0))
    while (allCells.length > coreAllowed) {
      const c = allCells.pop()!
      allRemnants.push(rectToPoly(c.rect))
    }
  }

  if (!isTower && allCells.length === 0 && comCells.length === 0 &&
      towerParcels.length === 0 && plazaParcels.length === 0 &&
      (loop ? loop.housing.length === 0 && loop.ruko.length === 0 : true)) {
    throw new Error('Tidak ada kavling yang muat di dalam batas lahan. Coba kecilkan ukuran kavling atau lebar jalan.')
  }

  // buffer keliling & median boulevard dihitung sebagai RTH
  if (loop) allRemnants = allRemnants.concat(loop.rth)

  // --- Fasum & RTH ---
  let alloc: { fasum: ProtoParcel[]; rth: ProtoParcel[] }
  if (isTower || allCells.length === 0) {
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
    alloc = allocateFasumRth(allCells, allRemnants, totalArea, params, warnings, loop?.gate ?? null)
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
  if (loop) {
    loop.housing.forEach((q, i) => {
      addParcel({
        type: rowLotType, polygon: q.poly, label: `P-${String(i + 1).padStart(2, '0')}`,
        block: 'P', w: q.w, d: q.d,
      })
    })
    loop.ruko.forEach((q, i) => {
      addParcel({
        type: 'komersial', polygon: q.poly,
        label: `R-${String(comCells.length + i + 1).padStart(2, '0')}`,
        block: 'R', w: q.w, d: q.d,
      })
    })
  }
  for (const p of towerParcels) addParcel(p)
  for (const p of plazaParcels) addParcel(p)
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
    kavling: 0, jalan: 0, rth: 0, fasum: 0, komersial: 0, tower: 0, parkir: 0, plaza: 0,
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
    efficiencyPct: +((byTypeArea.kavling + byTypeArea.komersial + byTypeArea.tower + byTypeArea.plaza) / totalArea * 100).toFixed(2),
  }

  const sumPct = (Object.keys(stats.byType) as ParcelType[]).reduce((s, t) => s + stats.byType[t].pct, 0)
  if (sumPct < (loop ? 86 : 96) || sumPct > 106) {
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
