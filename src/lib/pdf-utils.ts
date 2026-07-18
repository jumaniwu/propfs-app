/**
 * Util PDF bersama: render halaman-halaman awal PDF menjadi canvas
 * (dipakai scan koordinat dan render dari file CAD/PDF).
 */
export async function pdfToCanvases(file: File, maxPages = 3): Promise<HTMLCanvasElement[]> {
  // build legacy: kompatibel dengan browser yang lebih lama
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const canvases: HTMLCanvasElement[] = []
  const n = Math.min(doc.numPages, maxPages)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    canvases.push(canvas)
  }
  return canvases
}
