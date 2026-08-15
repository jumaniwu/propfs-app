/**
 * Dialog "Render Masterplan": setelah siteplan jadi, AI me-render visual
 * bird-eye view fotorealistis kawasan dari 2-3 sudut pandang.
 */
import { useEffect, useState } from 'react'
import { simpanBerkas } from '@/lib/unduhBerkas'
import { Palette, Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import NumInput from '@/components/siteplan/NumInput'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SiteplanResult } from '@/engine/siteplan/layout.ts'
import {
  renderMasterplanViews, RENDER_STYLE_LABELS, RENDER_ANGLE_LABELS,
  type RenderAngle, type RenderStyle, type RenderTime, type RenderedView,
} from '@/lib/ai-render.ts'

interface Props {
  result: SiteplanResult | null
  /** lantai awal dari kebutuhan proyek (form utama / saran AI) */
  initialFloors?: { rumah: number; ruko: number; tower: number }
  /** coretan/draft user sebagai referensi zonasi render */
  sketchDataUrl?: string | null
}

const ALL_ANGLES: RenderAngle[] = ['depan', 'sudut', 'belakang']

export default function RenderMasterplanDialog({ result, initialFloors, sketchDataUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<RenderStyle>('modern-minimalis')
  const [timeOfDay, setTimeOfDay] = useState<RenderTime>('siang')
  const [floorRumah, setFloorRumah] = useState(initialFloors?.rumah ?? 1)
  const [floorRuko, setFloorRuko] = useState(initialFloors?.ruko ?? 2)
  const [floorTower, setFloorTower] = useState(initialFloors?.tower ?? 12)
  // sinkron bila kebutuhan lantai diubah dari form utama / AI
  useEffect(() => {
    if (initialFloors) {
      setFloorRumah(initialFloors.rumah)
      setFloorRuko(initialFloors.ruko)
      setFloorTower(initialFloors.tower)
    }
  }, [initialFloors])
  const [angles, setAngles] = useState<RenderAngle[]>(['depan', 'sudut'])
  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [views, setViews] = useState<RenderedView[]>([])

  const hasTower = (result?.stats.counts.tower ?? 0) > 0
  const hasRuko = (result?.stats.counts.komersial ?? 0) > 0
  const hasRumah = (result?.stats.counts.kavling ?? 0) > 0

  function toggleAngle(a: RenderAngle) {
    setAngles(prev => (prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]))
  }

  async function handleRender() {
    if (!result || angles.length === 0) return
    setError('')
    setViews([])
    setRendering(true)
    setProgress(2)
    try {
      const ordered = ALL_ANGLES.filter(a => angles.includes(a))
      const res = await renderMasterplanViews(
        result,
        { style, timeOfDay, floors: { rumah: floorRumah, ruko: floorRuko, tower: floorTower }, angles: ordered, sketchDataUrl },
        (done, total, label) => {
          setProgress(Math.max(4, (done / total) * 100))
          setStatus(done < total ? `Me-render ${label}… (${done + 1}/${total})` : 'Selesai')
        },
      )
      setViews(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRendering(false)
    }
  }

  function downloadView(v: RenderedView, i: number) {
    void simpanBerkas(v.dataUrl, `masterplan-${v.angle}-${i + 1}.png`, 'image/png')
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={!result}
        className="w-full gap-2 border-gold text-navy hover:bg-gold-lt"
        onClick={() => setOpen(true)}
      >
        <Palette className="h-4 w-4" /> Render Masterplan (AI)
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!rendering) setOpen(o) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Render Masterplan</DialogTitle>
            <DialogDescription>
              AI me-render visual bird-eye view fotorealistis kawasan berdasarkan denah siteplan Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Gaya Arsitektur</Label>
              <Select value={style} onValueChange={v => setStyle(v as RenderStyle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RENDER_STYLE_LABELS) as RenderStyle[]).map(s => (
                    <SelectItem key={s} value={s}>{RENDER_STYLE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Suasana</Label>
              <Select value={timeOfDay} onValueChange={v => setTimeOfDay(v as RenderTime)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="siang">Siang cerah</SelectItem>
                  <SelectItem value="senja">Senja (golden hour)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {hasRumah && (
              <div className="space-y-1.5">
                <Label className="text-xs">Lantai Rumah</Label>
                <NumInput value={floorRumah} onValue={setFloorRumah} min={1} max={3} />
              </div>
            )}
            {hasRuko && (
              <div className="space-y-1.5">
                <Label className="text-xs">Lantai Ruko</Label>
                <NumInput value={floorRuko} onValue={setFloorRuko} min={1} max={5} />
              </div>
            )}
            {hasTower && (
              <div className="space-y-1.5">
                <Label className="text-xs">Lantai Tower</Label>
                <NumInput value={floorTower} onValue={setFloorTower} min={4} max={50} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Sudut Pandang (pilih 2–3)</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_ANGLES.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAngle(a)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    angles.includes(a)
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white text-navy border-border hover:bg-slate-50'
                  }`}
                >
                  {RENDER_ANGLE_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          {sketchDataUrl && (
            <p className="text-[11px] text-muted-foreground">
              ✓ Draft coretan Anda dipakai sebagai referensi zonasi render.
            </p>
          )}
          <Button
            className="w-full h-11 font-bold bg-navy hover:bg-steel"
            disabled={rendering || angles.length === 0}
            onClick={handleRender}
          >
            {rendering
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {status || 'Me-render…'}</>
              : `Mulai Render (${angles.length} sudut)`}
          </Button>
          {rendering && <Progress value={progress} />}
          {error && <p className="text-xs text-red-dk">{error}</p>}

          {views.length > 0 && (
            <div className="space-y-4">
              {views.map((v, i) => (
                <div key={v.angle} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-navy">
                      {v.label}
                      {v.source === 'skematik' && (
                        <span className="ml-2 text-[10px] font-semibold text-blue-dk bg-blue-lt px-1.5 py-0.5 rounded">
                          Skematik 3D — geometri akurat
                        </span>
                      )}
                    </p>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                      onClick={() => downloadView(v, i)}>
                      <Download className="h-3 w-3" /> Unduh
                    </Button>
                  </div>
                  <img
                    src={v.dataUrl}
                    alt={v.label}
                    className="w-full rounded-lg border border-border"
                  />
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Render AI bersifat ilustrasi konsep; detail bangunan dapat berbeda dari denah teknis.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
