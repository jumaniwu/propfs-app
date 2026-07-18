/**
 * Penampil DXF minimal: parse entitas dari file DXF ASCII (AutoCAD)
 * lalu gambar ke canvas sebagai denah — cukup untuk pratinjau dan
 * untuk dibaca AI vision. Mendukung LINE, LWPOLYLINE, POLYLINE/VERTEX,
 * CIRCLE, ARC, TEXT/MTEXT, plus zona berwarna dari polyline tertutup,
 * HATCH, dan SOLID (warna entitas ACI / warna layer).
 * Parser murni (tanpa DOM) agar bisa diuji di Node.
 */

export interface DxfSegment { x1: number; y1: number; x2: number; y2: number }
export interface DxfText { x: number; y: number; h: number; str: string }
export interface DxfFill { pts: [number, number][]; aci: number }

export interface DxfParsed {
  segments: DxfSegment[]
  texts: DxfText[]
  fills: DxfFill[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
}

const ACI_BASE: Record<number, string> = {
  1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF',
  5: '#0000FF', 6: '#FF00FF', 7: '#2b2b2b', 8: '#808080', 9: '#c0c0c0',
}

/** Warna ACI AutoCAD → CSS (1-9 tabel baku; 10-249 rumus hue standar). */
export function aciToCss(aci: number): string {
  if (ACI_BASE[aci]) return ACI_BASE[aci]
  if (aci >= 250 && aci <= 255) {
    const g = 51 + (aci - 250) * 40
    return `rgb(${g},${g},${g})`
  }
  if (aci < 10 || aci > 249) return '#999999'
  const hue = Math.floor((aci - 10) / 10) * 15
  const j = (aci - 10) % 10
  const v = [255, 204, 153, 127, 76][Math.floor(j / 2)]
  const s = j % 2 === 0 ? 1 : 0.5
  const c = v * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  const seg = Math.floor(hue / 60) % 6
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg]
  return `rgb(${Math.round(rgb[0] + m)},${Math.round(rgb[1] + m)},${Math.round(rgb[2] + m)})`
}

export function parseDxf(text: string): DxfParsed {
  const lines = text.split(/\r?\n/)
  const segments: DxfSegment[] = []
  const texts: DxfText[] = []
  const fills: DxfFill[] = []
  const layerColors: Record<string, number> = {}

  type Ent = Record<string, number | string> & { verts?: [number, number][] }
  let cur: Ent | null = null
  let curType = ''
  let inPolyline = false
  let polyVerts: [number, number][] = []
  let polyClosed = false
  let polyAci = 0
  // HATCH: kumpulkan path batas (kode 10/20 antara 91 dan 75/98)
  let hatchPaths: [number, number][][] = []
  let hatchInBoundary = false

  const resolveAci = (e: Ent): number => {
    const c = Number(e['62'])
    if (isFinite(c) && c > 0 && c < 256) return c
    const layer = String(e['8'] ?? '')
    const lc = layerColors[layer]
    return isFinite(lc) && lc > 0 ? lc : 7
  }

  const finish = () => {
    if (!cur) return
    const num = (k: string) => Number(cur![k])
    if (curType === 'LAYER' && typeof cur['2'] === 'string') {
      const c = Math.abs(Number(cur['62']))
      if (isFinite(c) && c > 0) layerColors[String(cur['2'])] = c
    } else if (curType === 'LINE' && isFinite(num('10')) && isFinite(num('11'))) {
      segments.push({ x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') })
    } else if (curType === 'LWPOLYLINE' && cur.verts && cur.verts.length >= 2) {
      const v = cur.verts
      const closed = (Number(cur['70']) & 1) === 1
      for (let i = 0; i < v.length - 1; i++) {
        segments.push({ x1: v[i][0], y1: v[i][1], x2: v[i + 1][0], y2: v[i + 1][1] })
      }
      if (closed) {
        segments.push({ x1: v[v.length - 1][0], y1: v[v.length - 1][1], x2: v[0][0], y2: v[0][1] })
        // hanya zona berwarna eksplisit yang di-fill; warna default (7) = garis biasa
        const aci = resolveAci(cur)
        if (v.length >= 3 && aci !== 7) fills.push({ pts: v.map(p => [p[0], p[1]]), aci })
      }
    } else if (curType === 'SOLID' && isFinite(num('10'))) {
      // urutan sudut SOLID: 1,2,4,3
      const pts: [number, number][] = [[num('10'), num('20')], [num('11'), num('21')]]
      if (isFinite(num('13'))) pts.push([num('13'), num('23')])
      if (isFinite(num('12'))) pts.push([num('12'), num('22')])
      if (pts.length >= 3 && pts.every(p => p.every(isFinite))) {
        fills.push({ pts, aci: resolveAci(cur) })
        for (let i = 0; i < pts.length; i++) {
          const q = pts[(i + 1) % pts.length]
          segments.push({ x1: pts[i][0], y1: pts[i][1], x2: q[0], y2: q[1] })
        }
      }
    } else if (curType === 'HATCH') {
      const aci = resolveAci(cur)
      for (const path of hatchPaths) {
        if (path.length >= 3 && path.every(p => p.every(isFinite))) fills.push({ pts: path, aci })
      }
      hatchPaths = []
      hatchInBoundary = false
    } else if (curType === 'CIRCLE' && isFinite(num('40'))) {
      const cx = num('10'); const cy = num('20'); const r = num('40')
      for (let i = 0; i < 24; i++) {
        const a1 = (i / 24) * Math.PI * 2
        const a2 = ((i + 1) / 24) * Math.PI * 2
        segments.push({ x1: cx + r * Math.cos(a1), y1: cy + r * Math.sin(a1), x2: cx + r * Math.cos(a2), y2: cy + r * Math.sin(a2) })
      }
    } else if (curType === 'ARC' && isFinite(num('40'))) {
      const cx = num('10'); const cy = num('20'); const r = num('40')
      let a1 = (num('50') * Math.PI) / 180
      let a2 = (num('51') * Math.PI) / 180
      if (a2 <= a1) a2 += Math.PI * 2
      const steps = Math.max(4, Math.ceil(((a2 - a1) / (Math.PI * 2)) * 24))
      for (let i = 0; i < steps; i++) {
        const t1 = a1 + ((a2 - a1) * i) / steps
        const t2 = a1 + ((a2 - a1) * (i + 1)) / steps
        segments.push({ x1: cx + r * Math.cos(t1), y1: cy + r * Math.sin(t1), x2: cx + r * Math.cos(t2), y2: cy + r * Math.sin(t2) })
      }
    } else if ((curType === 'TEXT' || curType === 'MTEXT') && typeof cur['1'] === 'string') {
      texts.push({ x: num('10'), y: num('20'), h: isFinite(num('40')) ? num('40') : 2, str: String(cur['1']) })
    }
    cur = null
    curType = ''
  }

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim()
    const value = lines[i + 1]
    if (code === '0') {
      const v = value.trim().toUpperCase()
      if (v === 'VERTEX' && inPolyline) {
        if (curType === 'VERTEX' && cur) {
          const x = Number(cur['10']); const y = Number(cur['20'])
          if (isFinite(x) && isFinite(y)) polyVerts.push([x, y])
          cur = null; curType = ''
        } else {
          if (curType === 'POLYLINE' && cur) polyAci = resolveAci(cur)
          finish()
        }
        cur = {}
        curType = 'VERTEX'
        continue
      }
      if (v === 'SEQEND' && inPolyline) {
        if (curType === 'VERTEX' && cur) {
          const x = Number(cur['10']); const y = Number(cur['20'])
          if (isFinite(x) && isFinite(y)) polyVerts.push([x, y])
          cur = null; curType = ''
        }
        for (let k = 0; k < polyVerts.length - 1; k++) {
          segments.push({ x1: polyVerts[k][0], y1: polyVerts[k][1], x2: polyVerts[k + 1][0], y2: polyVerts[k + 1][1] })
        }
        if (polyClosed && polyVerts.length >= 2) {
          segments.push({
            x1: polyVerts[polyVerts.length - 1][0], y1: polyVerts[polyVerts.length - 1][1],
            x2: polyVerts[0][0], y2: polyVerts[0][1],
          })
          if (polyVerts.length >= 3 && polyAci > 0 && polyAci !== 7) fills.push({ pts: polyVerts.slice(), aci: polyAci })
        }
        inPolyline = false
        polyVerts = []
        polyClosed = false
        polyAci = 0
        continue
      }
      // entitas baru
      if (curType === 'VERTEX' && cur && inPolyline) {
        const x = Number(cur['10']); const y = Number(cur['20'])
        if (isFinite(x) && isFinite(y)) polyVerts.push([x, y])
        cur = null; curType = ''
      } else {
        finish()
      }
      if (v === 'POLYLINE') {
        inPolyline = true
        polyVerts = []
        polyClosed = false
        polyAci = 0
        cur = {}
        curType = 'POLYLINE'
      } else {
        cur = {}
        curType = v
      }
      continue
    }
    if (!cur) continue
    if (curType === 'POLYLINE' && code === '70') {
      polyClosed = (Number(value) & 1) === 1
      continue
    }
    if (curType === 'LWPOLYLINE' && (code === '10' || code === '20')) {
      cur.verts = cur.verts ?? []
      if (code === '10') cur.verts.push([Number(value), NaN])
      else if (cur.verts.length) cur.verts[cur.verts.length - 1][1] = Number(value)
      continue
    }
    if (curType === 'HATCH') {
      if (code === '91') { hatchInBoundary = true; hatchPaths = []; continue }
      if (code === '92') { hatchPaths.push([]); continue }
      if (code === '75' || code === '98') { hatchInBoundary = false }
      if (hatchInBoundary && (code === '10' || code === '20')) {
        if (!hatchPaths.length) hatchPaths.push([])
        const path = hatchPaths[hatchPaths.length - 1]
        if (code === '10') path.push([Number(value), NaN])
        else if (path.length) path[path.length - 1][1] = Number(value)
        continue
      }
    }
    if (!(code in cur)) cur[code] = isNaN(Number(value)) ? value : Number(value)
  }
  finish()

  const clean = segments.filter(s => [s.x1, s.y1, s.x2, s.y2].every(isFinite))
  const cleanFills = fills.filter(f => f.pts.length >= 3 && f.pts.every(p => p.every(isFinite)))
  let bounds: DxfParsed['bounds'] = null
  if (clean.length || cleanFills.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const s of clean) {
      minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2)
      minY = Math.min(minY, s.y1, s.y2); maxY = Math.max(maxY, s.y1, s.y2)
    }
    for (const f of cleanFills) {
      for (const p of f.pts) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
      }
    }
    bounds = { minX, minY, maxX, maxY }
  }
  return { segments: clean, texts, fills: cleanFills, bounds }
}

function fillArea(f: DxfFill): number {
  let s = 0
  for (let i = 0; i < f.pts.length; i++) {
    const [x1, y1] = f.pts[i]
    const [x2, y2] = f.pts[(i + 1) % f.pts.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s / 2)
}

/** Gambar hasil parse ke canvas putih: zona berwarna + garis gelap (gaya cetak CAD). */
export function drawDxfToCanvas(parsed: DxfParsed, longSide = 1600): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const b = parsed.bounds
  if (!b) {
    canvas.width = 400; canvas.height = 300
    const ctx0 = canvas.getContext('2d')!
    ctx0.fillStyle = '#fff'; ctx0.fillRect(0, 0, 400, 300)
    return canvas
  }
  const w = Math.max(b.maxX - b.minX, 1e-6)
  const h = Math.max(b.maxY - b.minY, 1e-6)
  if (w >= h) { canvas.width = longSide; canvas.height = Math.max(200, Math.round((longSide * h) / w)) }
  else { canvas.height = longSide; canvas.width = Math.max(200, Math.round((longSide * w) / h)) }
  const pad = 0.04
  const scale = Math.min(
    (canvas.width * (1 - 2 * pad)) / w,
    (canvas.height * (1 - 2 * pad)) / h,
  )
  const ox = canvas.width / 2 - ((b.minX + b.maxX) / 2) * scale
  const oy = canvas.height / 2 + ((b.minY + b.maxY) / 2) * scale
  const px = (x: number) => x * scale + ox
  const py = (y: number) => -y * scale + oy

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // zona berwarna: gambar yang besar dulu agar zona kecil tetap terlihat
  const ordered = [...parsed.fills].sort((a, b2) => fillArea(b2) - fillArea(a))
  ctx.globalAlpha = 0.55
  for (const f of ordered) {
    ctx.fillStyle = aciToCss(f.aci)
    ctx.beginPath()
    ctx.moveTo(px(f.pts[0][0]), py(f.pts[0][1]))
    for (let i = 1; i < f.pts.length; i++) ctx.lineTo(px(f.pts[i][0]), py(f.pts[i][1]))
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.strokeStyle = '#1a2530'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const s of parsed.segments) {
    ctx.moveTo(px(s.x1), py(s.y1))
    ctx.lineTo(px(s.x2), py(s.y2))
  }
  ctx.stroke()
  ctx.fillStyle = '#44525f'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  for (const t of parsed.texts.slice(0, 400)) {
    const fs = Math.max(7, Math.min(18, t.h * scale))
    ctx.font = `${fs}px system-ui, sans-serif`
    ctx.fillText(t.str, px(t.x), py(t.y))
  }
  return canvas
}
