/**
 * Dialog "Scan Foto Dokumen": foto/upload dokumen daftar koordinat →
 * OCR di browser (tesseract.js, dimuat dinamis) → pratinjau & koreksi →
 * kirim ke input koordinat.
 */
import { useRef, useState } from 'react'
import { Camera, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { polygonArea } from '@/engine/siteplan/geometry.ts'
import { parseManualCoords, parseOcrCoords } from '@/engine/siteplan/ocrParse.ts'

interface Props {
  onUse: (coordsText: string) => void
}

/** Pra-proses gambar di canvas: skala + grayscale + peregangan kontras. */
function preprocessImage(img: HTMLImageElement): HTMLCanvasElement {
  const targetW = 1600
  const scale = Math.min(1.5, targetW / img.width)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  let min = 255
  let max = 0
  const gray = new Uint8ClampedArray(px.length / 4)
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    gray[i / 4] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let i = 0; i < gray.length; i++) {
    const g = ((gray[i] - min) / range) * 255
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g
  }
  ctx.putImageData(data, 0, 0)
  return canvas
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang valid.')) }
    img.src = url
  })
}

export default function OcrScanDialog({ onUse }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'progress' | 'result' | 'error'>('progress')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [coordsText, setCoordsText] = useState('')
  const [offsetInfo, setOffsetInfo] = useState('')

  const preview = parseManualCoords(coordsText)
  const previewArea = preview.points.length >= 3 ? polygonArea(preview.points) : 0

  /** Render halaman-halaman awal PDF menjadi canvas (untuk OCR). */
  async function pdfToCanvases(file: File, maxPages = 3): Promise<HTMLCanvasElement[]> {
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

  async function processFile(file: File) {
    setOpen(true)
    setPhase('progress')
    setProgress(2)
    try {
      let canvases: HTMLCanvasElement[]
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        setStatus('Membuka PDF…')
        canvases = await pdfToCanvases(file)
      } else {
        setStatus('Memproses gambar…')
        const img = await loadImage(file)
        canvases = [preprocessImage(img)]
      }
      setProgress(5)
      setStatus('Memuat mesin OCR…')
      // global override (dipakai test); default: modul tesseract.js
      type TesseractLike = {
        recognize: (
          image: HTMLCanvasElement,
          lang: string,
          opts?: { logger?: (m: { status?: string; progress?: number }) => void },
        ) => Promise<{ data: { text: string } }>
      }
      const globalT = (window as { Tesseract?: TesseractLike }).Tesseract
      const Tesseract: TesseractLike =
        globalT ?? ((await import('tesseract.js')).default as unknown as TesseractLike)
      let fullText = ''
      for (let i = 0; i < canvases.length; i++) {
        const res = await Tesseract.recognize(canvases[i], 'eng', {
          logger: (m: { status?: string; progress?: number }) => {
            if (m.status === 'recognizing text') {
              const p = (i + (m.progress ?? 0)) / canvases.length
              setProgress(20 + 80 * p)
              setStatus(`Membaca dokumen… ${Math.round(p * 100)}%${canvases.length > 1 ? ` (hal. ${i + 1}/${canvases.length})` : ''}`)
            }
          },
        })
        fullText += res.data.text + '\n'
      }
      const parsed = parseOcrCoords(fullText)
      if (!parsed.points.length) {
        setPhase('error')
        setStatus('Tidak ada koordinat terbaca. Coba foto yang lebih tajam/terang, atau ketik manual.')
        return
      }
      setCoordsText(parsed.points.map(p => `${p[0]},${p[1]}`).join('\n'))
      setOffsetInfo(parsed.offset
        ? `Koordinat asli terdeteksi skala UTM/TM3 dan dikurangi offset E=${parsed.offset.x.toLocaleString('id-ID')}, N=${parsed.offset.y.toLocaleString('id-ID')} (bentuk & luas tidak berubah).`
        : '')
      setPhase('result')
    } catch (e) {
      setPhase('error')
      setStatus(`OCR gagal: ${e instanceof Error ? e.message : String(e)} (fitur ini butuh koneksi internet).`)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-dashed border-gold text-navy hover:bg-gold-lt"
          onClick={() => {
            if (cameraRef.current) cameraRef.current.value = ''
            cameraRef.current?.click()
          }}
        >
          <Camera className="h-4 w-4" /> Ambil Foto
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-dashed border-gold text-navy hover:bg-gold-lt"
          onClick={() => {
            if (fileRef.current) fileRef.current.value = ''
            fileRef.current?.click()
          }}
        >
          <Upload className="h-4 w-4" /> Upload Foto/File
        </Button>
      </div>
      {/* kamera langsung (HP) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void processFile(f)
        }}
      />
      {/* galeri / file manager: gambar atau PDF */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void processFile(f)
        }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Foto Dokumen</DialogTitle>
            <DialogDescription>
              Koordinat dibaca otomatis dari foto dokumen (mis. Surat Ukur).
            </DialogDescription>
          </DialogHeader>

          {phase === 'progress' && (
            <div className="space-y-2 py-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">{status}</p>
            </div>
          )}

          {phase === 'error' && (
            <p className="text-sm text-red-dk py-2">{status}</p>
          )}

          {phase === 'result' && (
            <div className="space-y-2 py-1">
              <p className="text-xs text-muted-foreground">
                Periksa &amp; koreksi hasil pembacaan sebelum digunakan:
              </p>
              <textarea
                value={coordsText}
                onChange={e => setCoordsText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {offsetInfo && <p className="text-xs text-blue-dk">{offsetInfo}</p>}
              <p className="text-xs text-muted-foreground">
                Titik: {preview.points.length}
                {previewArea > 0 && <> · Luas: ±{Math.round(previewArea).toLocaleString('id-ID')} m²</>}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              disabled={phase !== 'result' || preview.points.length < 3}
              onClick={() => {
                onUse(coordsText)
                setOpen(false)
              }}
            >
              Gunakan Koordinat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
