// Kanvas tanda tangan digital: gambar dengan jari/mouse, hasil dataURL PNG.
import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onChange: (dataUrl: string | null) => void
  height?: number
}

export default function SignaturePad({ onChange, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  // Dicatat di ref, BUKAN hanya di state: end() dulu membaca `empty` dari
  // closure render yang sama, sehingga bila React belum commit pembaruan
  // state sebelum pointerup, tanda tangan yang baru digambar dibuang begitu
  // saja dan pengguna melihat "tanda tangan belum digambar".
  const adaGoresan = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current!
    const parent = canvas.parentElement!
    const dpr = window.devicePixelRatio || 1
    canvas.width = parent.clientWidth * dpr
    canvas.height = height * dpr
    canvas.style.width = '100%'
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, parent.clientWidth, height)
    ctx.strokeStyle = '#10213a'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [height])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent) => {
    drawing.current = true
    try { canvasRef.current!.setPointerCapture(e.pointerId) } catch { /* abaikan */ }
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    // Ketukan tunggal (titik) juga dianggap tanda tangan yang sah.
    ctx.lineTo(p.x + 0.6, p.y + 0.6)
    ctx.stroke()
    adaGoresan.current = true
    setEmpty(false)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    adaGoresan.current = true
    if (empty) setEmpty(false)
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(adaGoresan.current ? canvasRef.current!.toDataURL('image/png') : null)
  }

  const clear = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    adaGoresan.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-navy/30 bg-white overflow-hidden touch-none">
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
            ✍️ Tanda tangan di sini
          </p>
        )}
        <canvas
          ref={canvasRef}
          className="block w-full touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={clear}>
        <Eraser className="w-3.5 h-3.5" /> Ulangi Tanda Tangan
      </Button>
    </div>
  )
}
