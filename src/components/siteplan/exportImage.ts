/**
 * Export siteplan: PNG resolusi tinggi & PDF A4 landscape (jsPDF).
 */
import { jsPDF } from 'jspdf'
import { bbox } from '@/engine/siteplan/geometry.ts'
import type { ParcelType, SiteplanResult } from '@/engine/siteplan/layout.ts'
import { SiteplanRenderer, PARCEL_TYPE_LABELS } from './SiteplanRenderer.ts'

const LONG_SIDE = 3000 // px

/** Render hasil ke canvas offscreen resolusi tinggi. */
export function renderToCanvas(result: SiteplanResult): HTMLCanvasElement {
  const bb = bbox(result.boundary)
  const w = bb.maxX - bb.minX
  const h = bb.maxY - bb.minY
  const canvas = document.createElement('canvas')
  if (w >= h) {
    canvas.width = LONG_SIDE
    canvas.height = Math.max(200, Math.round((LONG_SIDE * h) / w) + 160)
  } else {
    canvas.height = LONG_SIDE
    canvas.width = Math.max(200, Math.round((LONG_SIDE * w) / h) + 160)
  }
  const r = new SiteplanRenderer(canvas, { fixedSize: true, interactive: false, forceLabels: true })
  r.setData(result)
  const pad = 0.05
  const scale = Math.min(
    (canvas.width * (1 - 2 * pad)) / Math.max(w, 1e-6),
    (canvas.height * (1 - 2 * pad)) / Math.max(h, 1e-6),
  )
  r.scale = scale
  r.tx = canvas.width / 2 - ((bb.minX + bb.maxX) / 2) * scale
  r.ty = canvas.height / 2 + ((bb.minY + bb.maxY) / 2) * scale
  r.drawSync()
  r.destroy()
  return canvas
}

export function downloadPng(result: SiteplanResult, filenameBase = 'siteplan'): void {
  renderToCanvas(result).toBlob(blob => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${filenameBase}.png`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(a.href)
      a.remove()
    }, 1000)
  }, 'image/png')
}

export function downloadPdf(result: SiteplanResult, filenameBase = 'siteplan'): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageH = 210
  const margin = 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Siteplan', margin, margin + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(
    `Dibuat: ${today}  ·  Total luas lahan: ${result.stats.totalAreaM2.toLocaleString('id-ID')} m²`,
    margin, margin + 10,
  )

  const canvas = renderToCanvas(result)
  let imgW = 190
  let imgH = (imgW * canvas.height) / canvas.width
  const maxH = pageH - margin * 2 - 16
  if (imgH > maxH) {
    imgH = maxH
    imgW = (imgH * canvas.width) / canvas.height
  }
  doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin + 16, imgW, imgH)

  const tx = margin + imgW + 10
  let ty = margin + 20
  const colW = [40, 14, 22, 14]
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Ringkasan', tx, ty)
  ty += 6
  doc.setFontSize(8)
  let x = tx
  ;['Kategori', 'Jumlah', 'Luas (m²)', '%'].forEach((hd, i) => {
    doc.text(hd, x, ty)
    x += colW[i]
  })
  ty += 1.5
  doc.line(tx, ty, tx + colW.reduce((a, b) => a + b, 0), ty)
  ty += 4
  doc.setFont('helvetica', 'normal')
  const order: ParcelType[] = ['kavling', 'komersial', 'tower', 'parkir', 'jalan', 'fasum', 'rth']
  for (const t of order) {
    const s = result.stats.byType[t]
    if (!s || s.area < 0.5) continue
    const count = t === 'kavling' ? String(result.stats.counts.kavling)
      : t === 'komersial' ? String(result.stats.counts.komersial)
      : t === 'tower' ? String(result.stats.counts.tower) : '-'
    const row = [
      PARCEL_TYPE_LABELS[t], count,
      s.area.toLocaleString('id-ID', { maximumFractionDigits: 0 }), s.pct.toFixed(1),
    ]
    x = tx
    row.forEach((cell, i) => {
      doc.text(String(cell), x, ty)
      x += colW[i]
    })
    ty += 5
  }
  ty += 2
  doc.setFont('helvetica', 'bold')
  doc.text(`Efisiensi lahan: ${result.stats.efficiencyPct.toFixed(1)}%`, tx, ty)
  ty += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Parameter', tx, ty)
  ty += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const prm = result.params
  const lines = [
    `Kavling: ${prm.lot.w} × ${prm.lot.d} m`,
    `Jalan utama: ${prm.road.main} m · lingkungan: ${prm.road.secondary} m`,
    `Panjang blok maks: ${prm.blockMaxLen} m`,
    `Target RTH: ${prm.rthPct}% · fasum: ${prm.fasumPct}%`,
  ]
  if (prm.commercial.enabled) {
    lines.push(`Ruko: ${prm.commercial.w} × ${prm.commercial.d} m (maks ${prm.commercial.maxCount})`)
  }
  for (const l of lines) {
    doc.text(l, tx, ty)
    ty += 4.5
  }

  doc.save(`${filenameBase}.pdf`)
}
