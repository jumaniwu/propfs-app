/**
 * Primitif geometri murni untuk Siteplan Designer.
 * Point: [x, y] dalam meter, konvensi matematika (sumbu Y ke utara/atas).
 */

export type Point = [number, number]

export interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const EPS = 1e-9

/** Luas bertanda (shoelace). Positif jika CCW. */
export function signedArea(pts: Point[]): number {
  let s = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

export function polygonArea(pts: Point[]): number {
  return Math.abs(signedArea(pts))
}

/** Pastikan urutan titik berlawanan arah jarum jam (CCW). */
export function ensureCCW(pts: Point[]): Point[] {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts.slice()
}

export function centroid(pts: Point[]): Point {
  const a = signedArea(pts)
  if (Math.abs(a) < EPS) {
    let sx = 0
    let sy = 0
    for (const p of pts) { sx += p[0]; sy += p[1] }
    return [sx / pts.length, sy / pts.length]
  }
  let cx = 0
  let cy = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    const cross = p[0] * q[1] - q[0] * p[1]
    cx += (p[0] + q[0]) * cross
    cy += (p[1] + q[1]) * cross
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export function bbox(pts: Point[]): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] > maxY) maxY = p[1]
  }
  return { minX, minY, maxX, maxY }
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

export function pointOnSegment(p: Point, a: Point, b: Point, eps = 1e-9): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  const len = dist(a, b)
  if (len < eps) return dist(p, a) < eps
  if (Math.abs(cross) / len > eps) return false
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])
  return dot >= -eps && dot <= len * len + eps
}

/** Ray casting; titik tepat di tepi dianggap di dalam (toleransi eps). */
export function pointInPolygon(p: Point, poly: Point[], eps = 1e-9): boolean {
  const x = p[0]
  const y = p[1]
  let inside = false
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0]
    const yi = poly[i][1]
    const xj = poly[j][0]
    const yj = poly[j][1]
    if (pointOnSegment(p, poly[j], poly[i], eps)) return true
    if ((yi > y) !== (yj > y)) {
      const xInt = ((xj - xi) * (y - yi)) / (yj - yi) + xi
      if (x < xInt) inside = !inside
    }
  }
  return inside
}

/** Perpotongan dua segmen (termasuk sentuh ujung). */
export function segIntersects(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const orient = (p: Point, q: Point, r: Point): number => {
    const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    if (v > EPS) return 1
    if (v < -EPS) return -1
    return 0
  }
  const o1 = orient(a1, a2, b1)
  const o2 = orient(a1, a2, b2)
  const o3 = orient(b1, b2, a1)
  const o4 = orient(b1, b2, a2)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && pointOnSegment(b1, a1, a2)) return true
  if (o2 === 0 && pointOnSegment(b2, a1, a2)) return true
  if (o3 === 0 && pointOnSegment(a1, b1, b2)) return true
  if (o4 === 0 && pointOnSegment(a2, b1, b2)) return true
  return false
}

/** Apakah polygon sederhana (tidak self-intersect antar sisi non-bersebelahan). */
export function isSimplePolygon(pts: Point[]): boolean {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue
      if (segIntersects(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false
    }
  }
  return true
}

export function rotatePoints(pts: Point[], theta: number, origin: Point = [0, 0]): Point[] {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const [ox, oy] = origin
  return pts.map(p => {
    const x = p[0] - ox
    const y = p[1] - oy
    return [ox + x * c - y * s, oy + x * s + y * c] as Point
  })
}

/** Sudut (rad) sisi terpanjang polygon. */
export function longestEdgeAngle(pts: Point[]): number {
  let best = 0
  let bestLen = -1
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = dist(a, b)
    if (len > bestLen) {
      bestLen = len
      best = Math.atan2(b[1] - a[1], b[0] - a[0])
    }
  }
  return best
}

export function rectToPoly(r: Rect): Point[] {
  return [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]]
}

type InsideFn = (p: Point) => boolean
type IntersectFn = (a: Point, b: Point) => Point

function clipHalfPlane(poly: Point[], inside: InsideFn, intersect: IntersectFn): Point[] {
  const out: Point[] = []
  for (let i = 0, n = poly.length; i < n; i++) {
    const cur = poly[i]
    const prev = poly[(i + n - 1) % n]
    const curIn = inside(cur)
    const prevIn = inside(prev)
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur))
      out.push(cur)
    } else if (prevIn) {
      out.push(intersect(prev, cur))
    }
  }
  return out
}

function dedupe(pts: Point[]): Point[] {
  const out: Point[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    if (dist(p, q) > 1e-7) out.push(p)
  }
  return out.length >= 3 ? out : []
}

/**
 * Sutherland–Hodgman: clip polygon (boleh cekung) terhadap rect axis-aligned.
 */
export function clipPolyToRect(poly: Point[], rect: Rect): Point[] {
  let out = poly
  out = clipHalfPlane(out, p => p[0] >= rect.x1, (a, b) => {
    const t = (rect.x1 - a[0]) / (b[0] - a[0])
    return [rect.x1, a[1] + t * (b[1] - a[1])]
  })
  if (!out.length) return []
  out = clipHalfPlane(out, p => p[0] <= rect.x2, (a, b) => {
    const t = (rect.x2 - a[0]) / (b[0] - a[0])
    return [rect.x2, a[1] + t * (b[1] - a[1])]
  })
  if (!out.length) return []
  out = clipHalfPlane(out, p => p[1] >= rect.y1, (a, b) => {
    const t = (rect.y1 - a[1]) / (b[1] - a[1])
    return [a[0] + t * (b[0] - a[0]), rect.y1]
  })
  if (!out.length) return []
  out = clipHalfPlane(out, p => p[1] <= rect.y2, (a, b) => {
    const t = (rect.y2 - a[1]) / (b[1] - a[1])
    return [a[0] + t * (b[0] - a[0]), rect.y2]
  })
  return dedupe(out)
}

/**
 * Uji ketat: rect sepenuhnya di dalam polygon (4 sudut di dalam dengan inset
 * eps DAN tidak ada sisi boundary yang memotong sisi rect).
 */
export function rectFullyInside(rect: Rect, poly: Point[], eps = 0.01): boolean {
  const r: Rect = { x1: rect.x1 + eps, y1: rect.y1 + eps, x2: rect.x2 - eps, y2: rect.y2 - eps }
  if (r.x2 <= r.x1 || r.y2 <= r.y1) return false
  const corners = rectToPoly(r)
  for (let i = 0; i < 4; i++) {
    if (!pointInPolygon(corners[i], poly)) return false
  }
  const edges: Array<[Point, Point]> = [
    [corners[0], corners[1]], [corners[1], corners[2]],
    [corners[2], corners[3]], [corners[3], corners[0]],
  ]
  for (let j = 0, n = poly.length; j < n; j++) {
    const a = poly[j]
    const b = poly[(j + 1) % n]
    for (let k = 0; k < 4; k++) {
      if (segIntersects(a, b, edges[k][0], edges[k][1])) return false
    }
  }
  return true
}

/* ---------------- Offset & containment umum (engine v2) ---------------- */

/**
 * Offset polygon CCW ke DALAM sejauh d (miter sederhana).
 * Mengembalikan null bila hasil tidak valid (terlalu besar d / self-intersect).
 */
export function offsetPolygonInward(ptsIn: Point[], d: number): Point[] | null {
  const pts = ensureCCW(ptsIn)
  const n = pts.length
  const lines: Array<{ p: Point; dir: Point }> = []
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = dist(a, b)
    if (len < 1e-9) return null
    const ux = (b[0] - a[0]) / len
    const uy = (b[1] - a[1]) / len
    // normal kiri (interior CCW) = (-uy, ux)
    const off: Point = [a[0] - uy * d, a[1] + ux * d]
    lines.push({ p: off, dir: [ux, uy] })
  }
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n]
    const l2 = lines[i]
    const cross = l1.dir[0] * l2.dir[1] - l1.dir[1] * l2.dir[0]
    if (Math.abs(cross) < 1e-9) {
      out.push(l2.p) // hampir kolinear
      continue
    }
    const dx = l2.p[0] - l1.p[0]
    const dy = l2.p[1] - l1.p[1]
    const t = (dx * l2.dir[1] - dy * l2.dir[0]) / cross
    out.push([l1.p[0] + l1.dir[0] * t, l1.p[1] + l1.dir[1] * t])
  }
  if (!isSimplePolygon(out)) return null
  // hasil harus tetap CCW (offset berlebihan membalik orientasi)
  if (signedArea(out) <= 0) return null
  const a0 = polygonArea(pts)
  const a1 = polygonArea(out)
  if (a1 <= 0 || a1 >= a0) return null
  // semua titik hasil harus di dalam polygon asal
  for (const p of out) if (!pointInPolygon(p, pts)) return null
  return out
}

/**
 * Uji ketat polygon (quad/segi-n cembung kecil) sepenuhnya di dalam boundary,
 * dengan inset eps ke arah centroid — versi umum dari rectFullyInside.
 */
export function polyFullyInside(quad: Point[], boundary: Point[], eps = 0.01): boolean {
  const c = centroid(quad)
  const shrunk = quad.map(p => {
    const dx = c[0] - p[0]
    const dy = c[1] - p[1]
    const len = Math.hypot(dx, dy) || 1
    return [p[0] + (dx / len) * eps, p[1] + (dy / len) * eps] as Point
  })
  for (const p of shrunk) if (!pointInPolygon(p, boundary)) return false
  const m = shrunk.length
  for (let i = 0; i < m; i++) {
    const a = shrunk[i]
    const b = shrunk[(i + 1) % m]
    for (let j = 0, n = boundary.length; j < n; j++) {
      if (segIntersects(a, b, boundary[j], boundary[(j + 1) % n])) return false
    }
  }
  return true
}

/** Apakah dua polygon cembung kecil saling tumpang tindih (uji tepi + centroid). */
export function polysOverlap(a: Point[], b: Point[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segIntersects(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  return pointInPolygon(centroid(a), b) || pointInPolygon(centroid(b), a)
}
