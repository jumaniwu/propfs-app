/**
 * "Render dari File Desain": upload siteplan jadi (DXF AutoCAD / PDF /
 * gambar) → AI membaca denah → AI mengajukan pertanyaan konsep →
 * user menjawab → render bird-eye fotorealistis mengikuti denah.
 */
import { useRef, useState } from 'react'
import { FileUp, Loader2, Download, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import NumInput from '@/components/siteplan/NumInput'
import { parseDxf, drawDxfToCanvas } from '@/lib/dxf-view.ts'
import { pdfToCanvases } from '@/lib/pdf-utils.ts'
import {
  analyzeCadPlan, renderCadViews, fallbackQuestions, CAD_ANGLE_LABELS,
  type CadAnalysis, type CadAngle, type CadRenderedView,
} from '@/lib/ai-cadrender.ts'

const ALL_ANGLES: CadAngle[] = ['depan', 'sudut', 'atas']

type Phase = 'idle' | 'reading' | 'analyzing' | 'questions' | 'rendering' | 'done' | 'error'

export default function CadRenderDialog() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [planUrl, setPlanUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState<CadAnalysis | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [angles, setAngles] = useState<CadAngle[]>(['depan', 'sudut'])
  const [views, setViews] = useState<CadRenderedView[]>([])
  const [error, setError] = useState('')

  function reset() {
    setPhase('idle')
    setPlanUrl(null)
    setAnalysis(null)
    setAnswers({})
    setViews([])
    setError('')
  }

  async function fileToPlanUrl(file: File): Promise<string> {
    const name = file.name.toLowerCase()
    if (name.endsWith('.dxf')) {
      const text = await file.text()
      const parsed = parseDxf(text)
      if (!parsed.segments.length) {
        throw new Error('DXF tidak berisi garis yang bisa dibaca. Simpan sebagai DXF ASCII (R12/2000) dari AutoCAD, atau export PDF.')
      }
      return drawDxfToCanvas(parsed).toDataURL('image/png')
    }
    if (name.endsWith('.dwg')) {
      throw new Error('File DWG (binary) belum didukung — dari AutoCAD pilih SAVE AS → DXF, atau PLOT ke PDF.')
    }
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      const canvases = await pdfToCanvases(file, 1)
      if (!canvases.length) throw new Error('PDF kosong.')
      return canvases[0].toDataURL('image/png')
    }
    // gambar biasa
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Gagal membaca file.'))
      reader.readAsDataURL(file)
    })
  }

  async function processFile(file: File) {
    reset()
    setOpen(true)
    setFileName(file.name)
    setPhase('reading')
    setStatus('Membaca file desain…')
    setProgress(10)
    try {
      const url = await fileToPlanUrl(file)
      setPlanUrl(url)
      setPhase('analyzing')
      setStatus('AI menganalisis denah & menyusun pertanyaan…')
      setProgress(40)
      let a: CadAnalysis
      try {
        a = await analyzeCadPlan([url])
      } catch {
        a = { deskripsi: 'AI tidak tersedia — jawab pertanyaan umum berikut.', questions: fallbackQuestions() }
      }
      setAnalysis(a)
      const init: Record<string, string | number> = {}
      for (const q of a.questions) {
        if (q.default !== undefined) init[q.id] = q.default
        else if (q.type === 'select' && q.options?.length) init[q.id] = q.options[0]
        else if (q.type === 'number') init[q.id] = 1
        else init[q.id] = ''
      }
      setAnswers(init)
      setPhase('questions')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  async function handleRender() {
    if (!planUrl || !analysis || angles.length === 0) return
    setPhase('rendering')
    setError('')
    setProgress(4)
    try {
      const ordered = ALL_ANGLES.filter(a => angles.includes(a))
      const res = await renderCadViews(planUrl, analysis, answers, ordered, (done, total, label) => {
        setProgress(Math.max(6, (done / total) * 100))
        setStatus(done < total ? `Me-render ${label}… (${done + 1}/${total})` : 'Selesai')
      })
      setViews(res)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('questions')
    }
  }

  function downloadView(v: CadRenderedView, i: number) {
    const a = document.createElement('a')
    a.href = v.dataUrl
    a.download = `render-${v.angle}-${i + 1}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const busy = phase === 'reading' || phase === 'analyzing' || phase === 'rendering'

  return (
    <>
      <Button
        type="button"
        className="w-full gap-2 h-11 font-bold bg-gold hover:bg-gold/90 text-navy"
        onClick={() => {
          if (fileRef.current) fileRef.current.value = ''
          fileRef.current?.click()
        }}
      >
        <FileUp className="h-4 w-4" /> Render dari File AutoCAD / PDF
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".dxf,.dwg,application/pdf,image/*"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void processFile(f)
        }}
      />

      <Dialog open={open} onOpenChange={o => { if (!busy) setOpen(o) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Render Konsep dari File Desain</DialogTitle>
            <DialogDescription>
              {fileName ? `File: ${fileName}` : 'Upload DXF (AutoCAD), PDF, atau gambar denah.'}
            </DialogDescription>
          </DialogHeader>

          {busy && (
            <div className="space-y-2 py-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {status}
              </p>
            </div>
          )}

          {phase === 'error' && <p className="text-sm text-red-dk py-2">{error}</p>}

          {planUrl && phase !== 'reading' && (
            <img src={planUrl} alt="Denah" className="w-full max-h-64 object-contain rounded-lg border border-border bg-white" />
          )}

          {(phase === 'questions' || phase === 'done') && analysis && (
            <div className="space-y-3">
              <p className="text-xs bg-gold-lt/40 border border-gold/30 rounded-lg p-3 text-navy">
                <span className="font-bold">AI membaca denah:</span> {analysis.deskripsi}
              </p>

              {phase === 'questions' && (
                <>
                  <p className="text-xs font-bold text-navy">Jawab pertanyaan konsep dari AI:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analysis.questions.map(q => (
                      <div key={q.id} className="space-y-1">
                        <Label className="text-xs">{q.question}</Label>
                        {q.type === 'select' && q.options ? (
                          <Select
                            value={String(answers[q.id] ?? q.options[0])}
                            onValueChange={v => setAnswers(prev => ({ ...prev, [q.id]: v }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {q.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : q.type === 'number' ? (
                          <NumInput
                            value={Number(answers[q.id] ?? 1)}
                            onValue={n => setAnswers(prev => ({ ...prev, [q.id]: n }))}
                            min={0}
                          />
                        ) : (
                          <input
                            value={String(answers[q.id] ?? '')}
                            onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Sudut Pandang (pilih 1–3)</Label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_ANGLES.map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAngles(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            angles.includes(a)
                              ? 'bg-navy text-white border-navy'
                              : 'bg-white text-navy border-border hover:bg-slate-50'
                          }`}
                        >
                          {CAD_ANGLE_LABELS[a]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && <p className="text-xs text-red-dk">{error}</p>}
                  <Button
                    className="w-full h-11 font-bold bg-navy hover:bg-steel gap-2"
                    disabled={angles.length === 0}
                    onClick={handleRender}
                  >
                    <Wand2 className="h-4 w-4" /> Mulai Render ({angles.length} sudut)
                  </Button>
                </>
              )}

              {phase === 'done' && (
                <div className="space-y-4">
                  {views.map((v, i) => (
                    <div key={v.angle} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-navy">{v.label}</p>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                          onClick={() => downloadView(v, i)}>
                          <Download className="h-3 w-3" /> Unduh
                        </Button>
                      </div>
                      <img src={v.dataUrl} alt={v.label} className="w-full rounded-lg border border-border" />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setPhase('questions')}>
                      Ubah Jawaban & Render Ulang
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => {
                      if (fileRef.current) fileRef.current.value = ''
                      fileRef.current?.click()
                    }}>
                      File Lain
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
