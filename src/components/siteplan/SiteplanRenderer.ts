/**
 * Penggambar siteplan di canvas 2D dengan zoom/pan/tooltip.
 * Transform: sx = x*scale + tx ; sy = -y*scale + ty (Y dunia ke utara/atas).
 * Dipakai oleh SiteplanPage (interaktif) dan exportImage (offscreen).
 */
import { bbox, centroid, pointInPolygon, type Point } from '@/engine/siteplan/geometry.ts'
import type { Parcel, ParcelType, SiteplanResult } from '@/engine/siteplan/layout.ts'

export const PARCEL_COLORS: Record<ParcelType | 'boundary', { fill: string; stroke: string }> = {
  kavling: { fill: '#ffe0b2', stroke: '#c8935a' },
  komersial: { fill: '#ce93d8', stroke: '#8e5a9e' },
  jalan: { fill: '#b0bec5', stroke: '#8fa0a8' },
  rth: { fill: '#81c784', stroke: '#4e9553' },
  fasum: { fill: '#64b5f6', stroke: '#3d7fb5' },
  tower: { fill: '#9fa8da', stroke: '#5c6bc0' },
  parkir: { fill: '#eceff1', stroke: '#a7b6bd' },
  plaza: { fill: '#80deea', stroke: '#31a3b5' },
  boundary: { fill: 'none', stroke: '#22303c' },
}

export const PARCEL_TYPE_LABELS: Record<ParcelType, string> = {
  kavling: 'Kavling Rumah',
  komersial: 'Komersial (Ruko)',
  jalan: 'Jalan',
  fasum: 'Fasum / Fasos',
  rth: 'RTH / Taman',
  tower: 'Tower (Apartemen/Hotel)',
  parkir: 'Parkir',
  plaza: 'Foodcourt / Plaza',
}

const LEGEND_ITEMS: Array<[ParcelType, string]> = [
  ['kavling', 'Kavling Rumah'],
  ['komersial', 'Komersial (Ruko)'],
  ['tower', 'Tower'],
  ['plaza', 'Foodcourt/Plaza'],
  ['parkir', 'Parkir'],
  ['jalan', 'Jalan'],
  ['fasum', 'Fasum / Fasos'],
  ['rth', 'RTH / Taman'],
]

const LABEL_COLORS: Partial<Record<ParcelType, string>> = {
  rth: '#2e5e31',
  fasum: '#1d4f7a',
  tower: '#33397a',
  parkir: '#546e7a',
  plaza: '#0d5b66',
}

const DRAW_ORDER: Record<ParcelType, number> = {
  jalan: 0, parkir: 1, rth: 2, fasum: 3, kavling: 4, komersial: 5, plaza: 6, tower: 7,
}

export interface RendererOptions {
  fixedSize?: boolean
  interactive?: boolean
  forceLabels?: boolean
  onHover?: (parcel: Parcel | null, screenPos: [number, number]) => void
  /** Dipanggil saat user mengeklik salah satu sisi boundary pada mode pratinjau. */
  onEdgeClick?: (edgeIndex: number) => void
}

export class SiteplanRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private opts: RendererOptions
  private result: SiteplanResult | null = null
  private hovered: Parcel | null = null
  private raf = 0
  private fitScale = 1
  private dpr = 1
  private cleanupFns: Array<() => void> = []

  scale = 1 // px per meter
  tx = 0
  ty = 0

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas
    this.opts = opts
    this.ctx = canvas.getContext('2d')!
    if (!opts.fixedSize) this.resize()
    if (opts.interactive !== false) this.bindEvents()
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.cleanupFns.forEach(fn => fn())
    this.cleanupFns = []
  }

  resize(): void {
    if (this.opts.fixedSize) return
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round((this.canvas.clientWidth || 1) * dpr)
    this.canvas.height = Math.round((this.canvas.clientHeight || 1) * dpr)
    this.dpr = dpr
  }

  private viewSize(): { w: number; h: number; dpr: number } {
    const dpr = this.opts.fixedSize ? 1 : this.dpr || 1
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr, dpr }
  }

  private previewBoundary: Point[] | null = null
  private previewFrontage: number | null = null

  setData(result: SiteplanResult | null): void {
    this.result = result
    this.hovered = null
  }

  /** Mode pratinjau batas lahan (sebelum generate): tampilkan polygon + pilih sisi jalan utama. */
  setPreview(boundary: Point[] | null, frontageEdge: number | null): void {
    this.previewBoundary = boundary
    this.previewFrontage = frontageEdge
  }

  fitToView(): void {
    const ref = this.result?.boundary ?? this.previewBoundary
    if (!ref) return
    const bb = bbox(ref)
    const v = this.viewSize()
    const pad = 0.08
    const sw = (v.w * (1 - 2 * pad)) / Math.max(bb.maxX - bb.minX, 1e-6)
    const sh = (v.h * (1 - 2 * pad)) / Math.max(bb.maxY - bb.minY, 1e-6)
    this.scale = Math.min(sw, sh)
    this.tx = v.w / 2 - ((bb.minX + bb.maxX) / 2) * this.scale
    this.ty = v.h / 2 + ((bb.minY + bb.maxY) / 2) * this.scale
    this.fitScale = this.scale
    this.draw()
  }

  worldToScreen(p: Point): [number, number] {
    return [p[0] * this.scale + this.tx, -p[1] * this.scale + this.ty]
  }

  screenToWorld(p: [number, number]): Point {
    return [(p[0] - this.tx) / this.scale, -(p[1] - this.ty) / this.scale]
  }

  draw(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.drawNow()
    })
  }

  drawSync(): void {
    this.drawNow()
  }

  private drawNow(): void {
    const ctx = this.ctx
    const v = this.viewSize()
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
    ctx.clearRect(0, 0, v.w, v.h)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, v.w, v.h)
    if (!this.result) {
      if (this.previewBoundary) this.drawPreview(v)
      return
    }

    const parcels = this.result.parcels.slice().sort((a, b) => DRAW_ORDER[a.type] - DRAW_ORDER[b.type])

    for (const p of parcels) {
      const col = PARCEL_COLORS[p.type]
      this.path(p.polygon)
      ctx.fillStyle = col.fill
      ctx.fill()
      ctx.strokeStyle = col.stroke
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    if (this.hovered) {
      this.path(this.hovered.polygon)
      ctx.strokeStyle = '#1e2a36'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    this.path(this.result.boundary)
    ctx.strokeStyle = PARCEL_COLORS.boundary.stroke
    ctx.lineWidth = 2.5
    ctx.stroke()

    this.drawLabels(parcels)
    this.drawLegend(v)
    this.drawNorthArrow()
    this.drawScaleBar(v)
  }

  private drawPreview(v: { w: number; h: number }): void {
    const ctx = this.ctx
    const pts = this.previewBoundary!
    // isi polygon tipis
    this.path(pts)
    ctx.fillStyle = 'rgba(201, 168, 76, 0.08)'
    ctx.fill()
    ctx.strokeStyle = '#22303c'
    ctx.lineWidth = 2
    ctx.stroke()
    // sisi frontage terpilih disorot emas
    if (this.previewFrontage != null && this.previewFrontage < pts.length) {
      const a = this.worldToScreen(pts[this.previewFrontage])
      const b = this.worldToScreen(pts[(this.previewFrontage + 1) % pts.length])
      ctx.strokeStyle = '#C9A84C'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = '#8a6d1a'
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('JALAN UTAMA', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 14)
    }
    // titik & nomor sisi
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < pts.length; i++) {
      const s = this.worldToScreen(pts[i])
      ctx.fillStyle = '#22303c'
      ctx.beginPath()
      ctx.arc(s[0], s[1], 4, 0, Math.PI * 2)
      ctx.fill()
      const nxt = this.worldToScreen(pts[(i + 1) % pts.length])
      const mx = (s[0] + nxt[0]) / 2
      const my = (s[1] + nxt[1]) / 2
      if (i !== this.previewFrontage) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.arc(mx, my, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#62707e'
        ctx.font = '600 10px system-ui, sans-serif'
        ctx.fillText(String(i + 1), mx, my)
      }
    }
    // petunjuk
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillRect(v.w / 2 - 190, v.h - 40, 380, 26)
    ctx.fillStyle = '#62707e'
    ctx.font = '11.5px system-ui, sans-serif'
    ctx.fillText('Klik salah satu sisi lahan untuk menandai posisi JALAN UTAMA', v.w / 2, v.h - 27)
    this.drawNorthArrow()
    this.drawScaleBar(v)
  }

  /** Cari index sisi terdekat dari titik layar (threshold px). */
  edgeAtScreenPoint(px: number, py: number, thresholdPx = 14): number | null {
    const pts = this.previewBoundary
    if (!pts) return null
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < pts.length; i++) {
      const a = this.worldToScreen(pts[i])
      const b = this.worldToScreen(pts[(i + 1) % pts.length])
      const d = distToSegment([px, py], a, b)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return bestD <= thresholdPx ? best : null
  }

  private path(poly: Point[]): void {
    const ctx = this.ctx
    ctx.beginPath()
    poly.forEach((pt, i) => {
      const s = this.worldToScreen(pt)
      if (i === 0) ctx.moveTo(s[0], s[1])
      else ctx.lineTo(s[0], s[1])
    })
    ctx.closePath()
  }

  private drawLabels(parcels: Parcel[]): void {
    const ctx = this.ctx
    const force = this.opts.forceLabels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const p of parcels) {
      if (!p.label) continue
      const s = this.worldToScreen(centroid(p.polygon))
      if (p.type === 'kavling' || p.type === 'komersial') {
        const wPx = (p.w || 6) * this.scale
        if (!force && wPx < 26) continue
        const fs = Math.max(9, Math.min(13, wPx * 0.28))
        ctx.fillStyle = '#5b4a30'
        ctx.font = `600 ${fs}px system-ui, sans-serif`
        if (force || wPx > 48) {
          ctx.fillText(p.label, s[0], s[1] - fs * 0.55)
          ctx.font = `${fs * 0.85}px system-ui, sans-serif`
          ctx.fillText(`${p.w}×${p.d}`, s[0], s[1] + fs * 0.6)
        } else {
          ctx.fillText(p.label, s[0], s[1])
        }
      } else {
        const areaPx = p.areaM2 * this.scale * this.scale
        if (!force && areaPx < 2000) continue
        ctx.fillStyle = LABEL_COLORS[p.type] ?? '#33414e'
        ctx.font = '700 12px system-ui, sans-serif'
        ctx.fillText(p.label, s[0], s[1])
      }
    }
  }

  private drawLegend(v: { w: number }): void {
    const ctx = this.ctx
    // hanya tampilkan kategori yang benar-benar ada di siteplan ini
    const present = new Set(this.result!.parcels.map(p => p.type))
    const items = LEGEND_ITEMS.filter(([type]) => present.has(type))
    if (!items.length) return
    const pad = 10
    const lh = 19
    const w = 160
    const h = items.length * lh + 16
    const x = v.w - w - 12
    const y = 12
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = '#d5dce3'
    ctx.lineWidth = 1
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    items.forEach(([type, name], i) => {
      const iy = y + 8 + lh * i + lh / 2 - 2
      ctx.fillStyle = PARCEL_COLORS[type].fill
      ctx.strokeStyle = PARCEL_COLORS[type].stroke
      roundRect(ctx, x + pad, iy - 6, 12, 12, 3)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#33414e'
      ctx.font = '11.5px system-ui, sans-serif'
      ctx.fillText(name, x + pad + 19, iy)
    })
  }

  private drawNorthArrow(): void {
    const ctx = this.ctx
    const x = 30
    const y = 38
    const r = 16
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = '#d5dce3'
    ctx.beginPath()
    ctx.arc(x, y, r + 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y - r + 3)
    ctx.lineTo(x - 6, y + r - 8)
    ctx.lineTo(x, y + r - 13)
    ctx.lineTo(x + 6, y + r - 8)
    ctx.closePath()
    ctx.fillStyle = '#22303c'
    ctx.fill()
    ctx.font = '700 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('U', x, y + r + 12)
  }

  private drawScaleBar(v: { h: number }): void {
    const ctx = this.ctx
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500]
    let len = nice[0]
    for (const n of nice) {
      if (n * this.scale <= 140) len = n
    }
    const px = len * this.scale
    const x = 14
    const y = v.h - 22
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(x - 4, y - 16, px + 44, 26)
    ctx.strokeStyle = '#22303c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x, y)
    ctx.lineTo(x + px, y)
    ctx.lineTo(x + px, y - 4)
    ctx.stroke()
    ctx.fillStyle = '#22303c'
    ctx.font = '11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${len} m`, x + px + 6, y + 2)
  }

  /* ---------------- Interaksi ---------------- */

  private bindEvents(): void {
    const canvas = this.canvas
    let dragging = false
    let lastX = 0
    let lastY = 0
    let downX = 0
    let downY = 0

    const onWheel = (e: WheelEvent) => {
      if (!this.result) return
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      let k = Math.exp(-e.deltaY * 0.0015)
      const newScale = Math.min(200, Math.max(this.fitScale / 10, this.scale * k))
      k = newScale / this.scale
      this.scale = newScale
      this.tx = mx - (mx - this.tx) * k
      this.ty = my - (my - this.ty) * k
      this.draw()
    }

    const onPointerDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      downX = e.clientX
      downY = e.clientY
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      if (dragging) {
        this.tx += e.clientX - lastX
        this.ty += e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY
        this.opts.onHover?.(null, [0, 0])
        this.draw()
      } else {
        this.handleHover(e)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      dragging = false
      canvas.releasePointerCapture(e.pointerId)
      canvas.style.cursor = 'grab'
      // klik (bukan drag) pada mode pratinjau → pilih sisi jalan utama
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
      if (moved < 5 && !this.result && this.previewBoundary && this.opts.onEdgeClick) {
        const rect = canvas.getBoundingClientRect()
        const idx = this.edgeAtScreenPoint(e.clientX - rect.left, e.clientY - rect.top)
        if (idx !== null) this.opts.onEdgeClick(idx)
      }
    }

    const onPointerLeave = () => {
      this.opts.onHover?.(null, [0, 0])
      if (this.hovered) {
        this.hovered = null
        this.draw()
      }
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.style.cursor = 'grab'
    this.cleanupFns.push(() => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
    })
  }

  private handleHover(e: PointerEvent): void {
    if (!this.result) return
    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const w = this.screenToWorld([mx, my])
    let hit: Parcel | null = null
    // prioritas kavling/komersial, lalu lainnya
    for (let pass = 0; pass < 2 && !hit; pass++) {
      for (const p of this.result.parcels) {
        const isLot = p.type === 'kavling' || p.type === 'komersial'
        if ((pass === 0) !== isLot) continue
        if (pointInPolygon(w, p.polygon)) {
          hit = p
          break
        }
      }
    }
    if (hit !== this.hovered) {
      this.hovered = hit
      this.draw()
    }
    this.opts.onHover?.(hit, [mx, my])
  }
}

function distToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
