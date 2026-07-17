/**
 * Render 3D skematik (isometrik) langsung dari data siteplan — geometri
 * PASTI sama dengan denah: bentuk lahan, posisi & ukuran tiap bangunan,
 * tinggi sesuai jumlah lantai. Dipakai sebagai dasar image-to-image untuk
 * render AI fotorealistis, dan sebagai fallback bila AI tidak tersedia.
 */
import { centroid, rotatePoints, type Point } from '@/engine/siteplan/geometry.ts'
import type { Parcel, ParcelType, SiteplanResult } from '@/engine/siteplan/layout.ts'

export interface Iso3DOptions {
  /** rotasi kamera terhadap denah (derajat): 0=dari jalan utama, 45=sudut, 180=belakang */
  angleDeg: number
  floors: { rumah: number; ruko: number; tower: number; plaza?: number }
  width?: number
  height?: number
}

const FLOOR_M = 3.2 // tinggi per lantai (meter)

const GROUND_COLORS: Partial<Record<ParcelType, string>> = {
  jalan: '#9aa7ae',
  parkir: '#d5dbde',
  rth: '#7cb87f',
  fasum: '#8fc3ee',
}

const BUILDING_STYLE: Partial<Record<ParcelType, { top: string; side: string; dark: string }>> = {
  kavling: { top: '#e8b96a', side: '#d9a04e', dark: '#b9822f' }, // atap genteng
  komersial: { top: '#c9a0d8', side: '#a878bb', dark: '#8a5c9e' },
  tower: { top: '#aeb6e8', side: '#8b95d6', dark: '#6b76bd' },
  plaza: { top: '#8fdbe6', side: '#5fc3d3', dark: '#3fa3b3' },
}

function floorsFor(p: Parcel, f: Iso3DOptions['floors']): number {
  if (p.type === 'kavling') return Math.max(1, f.rumah)
  if (p.type === 'komersial') return Math.max(1, f.ruko)
  if (p.type === 'tower') return Math.max(4, f.tower)
  if (p.type === 'plaza') return Math.max(1, f.plaza ?? 2)
  return 0
}

export function renderIsometric(result: SiteplanResult, opts: Iso3DOptions): HTMLCanvasElement {
  const W = opts.width ?? 1280
  const H = opts.height ?? 720
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const center = centroid(result.boundary)
  const theta = (opts.angleDeg * Math.PI) / 180

  // rotasi denah sesuai sudut kamera, lalu proyeksi isometrik sederhana:
  // px = x ; py = -y*0.5 - z (foreshorten + elevasi)
  const rot = (pts: Point[]) => rotatePoints(pts, theta, center)

  // skala: muat boundary + tinggi tower ke dalam canvas
  const bpts = rot(result.boundary)
  const maxFloors = Math.max(
    1,
    ...result.parcels.map(p => floorsFor(p, opts.floors)),
  )
  const maxHM = maxFloors * FLOOR_M
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of bpts) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, -p[1] * 0.5); maxY = Math.max(maxY, -p[1] * 0.5)
  }
  const pad = 0.1
  const scale = Math.min(
    (W * (1 - 2 * pad)) / Math.max(maxX - minX, 1e-6),
    (H * (1 - 2 * pad)) / Math.max(maxY - minY + maxHM * 0.9, 1e-6),
  )
  const ox = W / 2 - ((minX + maxX) / 2) * scale
  const oy = H * 0.56 - ((minY + maxY) / 2) * scale

  const proj = (p: Point, zM: number): [number, number] =>
    [p[0] * scale + ox, (-p[1] * 0.5 - 0) * scale + oy - zM * scale * 0.9]

  const path = (pts: Point[], zM: number) => {
    ctx.beginPath()
    pts.forEach((pt, i) => {
      const s = proj(pt, zM)
      if (i === 0) ctx.moveTo(s[0], s[1])
      else ctx.lineTo(s[0], s[1])
    })
    ctx.closePath()
  }

  // ===== latar: langit + tanah sekitar =====
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#cfe6f5')
  sky.addColorStop(0.45, '#e8f2ea')
  sky.addColorStop(1, '#dcead8')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // ===== lahan dasar =====
  path(bpts, 0)
  ctx.fillStyle = '#cfe0c6'
  ctx.fill()

  // ===== elemen datar (jalan, parkir, rth, fasum) =====
  const flats = result.parcels.filter(p => GROUND_COLORS[p.type])
  const order: ParcelType[] = ['jalan', 'parkir', 'rth', 'fasum']
  flats.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  for (const p of flats) {
    path(rot(p.polygon), 0)
    ctx.fillStyle = GROUND_COLORS[p.type]!
    ctx.fill()
  }
  // pohon kecil di RTH (deterministik dari centroid)
  for (const p of flats.filter(x => x.type === 'rth')) {
    const c = rot([centroid(p.polygon)])[0]
    const s = proj(c, 0)
    ctx.fillStyle = '#4e8f52'
    for (let i = 0; i < 3; i++) {
      const dx = ((i * 37 + Math.round(p.areaM2)) % 21) - 10
      const dy = ((i * 53 + Math.round(p.areaM2)) % 13) - 6
      ctx.beginPath()
      ctx.arc(s[0] + dx, s[1] + dy, Math.max(2, scale * 1.4), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // outline boundary
  path(bpts, 0)
  ctx.strokeStyle = '#42525e'
  ctx.lineWidth = 2
  ctx.stroke()

  // ===== bangunan (jauh → dekat) =====
  const buildings = result.parcels.filter(p => BUILDING_STYLE[p.type])
  const depth = (p: Parcel) => {
    const c = rot([centroid(p.polygon)])[0]
    return c[1] // y besar = jauh (digambar dulu)
  }
  buildings.sort((a, b) => depth(b) - depth(a))

  for (const p of buildings) {
    const st = BUILDING_STYLE[p.type]!
    const hM = floorsFor(p, opts.floors) * FLOOR_M
    const base = rot(p.polygon)
    // sisi: gambar semua quad sisi (jauh dulu berdasar midpoint y)
    const edges = base.map((pt, i) => [pt, base[(i + 1) % base.length]] as [Point, Point])
    edges.sort((e1, e2) => (e2[0][1] + e2[1][1]) - (e1[0][1] + e1[1][1]))
    for (const [a, b] of edges) {
      const a0 = proj(a, 0), b0 = proj(b, 0), a1 = proj(a, hM), b1 = proj(b, hM)
      ctx.beginPath()
      ctx.moveTo(a0[0], a0[1]); ctx.lineTo(b0[0], b0[1])
      ctx.lineTo(b1[0], b1[1]); ctx.lineTo(a1[0], a1[1])
      ctx.closePath()
      // sisi menghadap kiri lebih gelap (kesan arah cahaya)
      ctx.fillStyle = b[0] - a[0] >= 0 ? st.side : st.dark
      ctx.fill()
      ctx.strokeStyle = 'rgba(40,50,60,0.25)'
      ctx.lineWidth = 0.6
      ctx.stroke()
    }
    // atap/atas
    path(base, hM)
    ctx.fillStyle = st.top
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,50,60,0.35)'
    ctx.lineWidth = 0.8
    ctx.stroke()
    // garis lantai tower (kesan jendela bertingkat)
    if (p.type === 'tower' || p.type === 'plaza') {
      const fl = floorsFor(p, opts.floors)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 0.7
      for (let f = 1; f < fl; f++) {
        const z = f * FLOOR_M
        const a = proj(base[0], z)
        const b = proj(base[1], z)
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
      }
    }
  }

  return canvas
}
