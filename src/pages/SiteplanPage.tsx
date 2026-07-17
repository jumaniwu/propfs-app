/**
 * Design Siteplan — input titik koordinat batas lahan, siteplan terbentuk
 * otomatis: kavling, jalan, fasum, RTH, ruko. Export PNG / DXF / PDF.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map, FileImage, FileText, FileDown, Maximize2, Settings2, Building2, Sparkles, Loader2 } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import OcrScanDialog from '@/components/siteplan/OcrScanDialog'
import { SiteplanRenderer, PARCEL_COLORS, PARCEL_TYPE_LABELS } from '@/components/siteplan/SiteplanRenderer.ts'
import { downloadPng, downloadPdf } from '@/components/siteplan/exportImage.ts'
import { downloadDxf } from '@/engine/siteplan/exportDxf.ts'
import { ensureCCW, polygonArea } from '@/engine/siteplan/geometry.ts'
import { analyzeConceptSketch, type AIKonsepResult } from '@/lib/ai-siteplan.ts'
import {
  generateSiteplan, defaultSiteplanParams,
  type Parcel, type ParcelType, type SiteplanConcept, type SiteplanResult,
} from '@/engine/siteplan/layout.ts'
import { parseManualCoords } from '@/engine/siteplan/ocrParse.ts'
import { SITEPLAN_PRESETS } from '@/engine/siteplan/presets.ts'

const fmt = (n: number, dec = 0) =>
  n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: dec })

function tooltipText(p: Parcel): string {
  if (p.type === 'kavling') return `${p.label} · Kavling ${p.w}×${p.d} m · ${p.areaM2} m²`
  if (p.type === 'komersial') return `${p.label} · Ruko ${p.w}×${p.d} m · ${p.areaM2} m²`
  return `${PARCEL_TYPE_LABELS[p.type]} · ${p.areaM2} m²`
}

export default function SiteplanPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<SiteplanRenderer | null>(null)

  const [coordsText, setCoordsText] = useState('')
  const [genError, setGenError] = useState('')
  const [result, setResult] = useState<SiteplanResult | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [frontageEdge, setFrontageEdge] = useState<number | null>(null)
  const aiFileRef = useRef<HTMLInputElement>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiResult, setAiResult] = useState<AIKonsepResult | null>(null)

  // parameter form
  const [concept, setConcept] = useState<SiteplanConcept>('perumahan')
  const [towerW, setTowerW] = useState(20)
  const [towerD, setTowerD] = useState(30)
  const [towerCount, setTowerCount] = useState(1)
  const [lotW, setLotW] = useState(6)
  const [lotD, setLotD] = useState(12)
  const [roadMain, setRoadMain] = useState(8)
  const [roadSec, setRoadSec] = useState(6)
  const [blockMaxLen, setBlockMaxLen] = useState(60)
  const [rthPct, setRthPct] = useState(10)
  const [fasumPct, setFasumPct] = useState(5)
  const [comEnabled, setComEnabled] = useState(false)
  const [comW, setComW] = useState(5)
  const [comD, setComD] = useState(15)
  const [comMax, setComMax] = useState(10)

  const parsed = useMemo(() => parseManualCoords(coordsText), [coordsText])
  const parsedArea = parsed.points.length >= 3 ? polygonArea(parsed.points) : 0
  // boundary ternormalisasi CCW — index sisi di UI & engine mengacu ke array ini
  const boundaryCCW = useMemo(
    () => (parsed.points.length >= 3 ? ensureCCW(parsed.points) : null),
    [parsed.points],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new SiteplanRenderer(canvas, {
      onHover: (parcel, pos) => {
        setTooltip(parcel ? { text: tooltipText(parcel), x: pos[0], y: pos[1] } : null)
      },
      onEdgeClick: idx => setFrontageEdge(prev => (prev === idx ? null : idx)),
    })
    rendererRef.current = renderer
    const onResize = () => {
      renderer.resize()
      renderer.draw()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  // mode pratinjau: tampilkan boundary + pilihan sisi jalan utama sebelum generate
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    if (!result && boundaryCCW) {
      r.setPreview(boundaryCCW, frontageEdge)
      r.fitToView()
    } else {
      r.setPreview(null, null)
      r.draw()
    }
  }, [boundaryCCW, frontageEdge, result])

  async function handleAiSketch(file: File) {
    setAiError('')
    setAiLoading(true)
    try {
      const res = await analyzeConceptSketch(file)
      setAiResult(res)
      setConcept(res.concept)
      const p = res.params
      if (p.lotW) setLotW(p.lotW)
      if (p.lotD) setLotD(p.lotD)
      if (p.rukoW) setComW(p.rukoW)
      if (p.rukoD) setComD(p.rukoD)
      if (p.rukoMax) setComMax(p.rukoMax)
      if (p.towerW) setTowerW(p.towerW)
      if (p.towerD) setTowerD(p.towerD)
      if (p.towerCount) setTowerCount(p.towerCount)
      if (p.rthPct) setRthPct(p.rthPct)
      if (p.fasumPct) setFasumPct(p.fasumPct)
      if (res.concept === 'perumahan' && (p.rukoW || p.rukoMax)) setComEnabled(true)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiLoading(false)
    }
  }

  function handleGenerate() {
    setGenError('')
    if (parsed.errors.length) {
      setGenError(parsed.errors.join('\n'))
      return
    }
    if (parsed.points.length < 3) {
      setGenError('Masukkan minimal 3 titik koordinat.')
      return
    }
    try {
      const res = generateSiteplan(parsed.points, {
        lot: { w: lotW, d: lotD },
        road: { main: roadMain, secondary: roadSec },
        rthPct, fasumPct,
        commercial: { enabled: comEnabled, w: comW, d: comD, maxCount: comMax },
        blockMaxLen,
        concept,
        tower: { w: towerW, d: towerD, count: towerCount },
        frontageEdge,
      })
      setResult(res)
      // canvas baru terukur setelah panel ringkasan dirender → fit pada frame berikutnya
      requestAnimationFrame(() => {
        const r = rendererRef.current
        if (!r) return
        r.resize()
        r.setData(res)
        r.fitToView()
      })
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    }
  }

  const summaryOrder: ParcelType[] = ['kavling', 'komersial', 'tower', 'parkir', 'jalan', 'fasum', 'rth']

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header breadcrumbs={[{ label: 'Design Siteplan' }]} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 p-4 max-w-[1800px] w-full mx-auto">
        {/* ============ SIDEBAR ============ */}
        <div className="space-y-4 lg:overflow-y-auto lg:max-h-[calc(100vh-120px)] pr-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Map className="h-4 w-4 text-gold" /> 1. Batas Lahan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Koordinat dalam meter, satu titik per baris: <code className="bg-slate-100 px-1 rounded">x,y</code>.
                Polygon tertutup otomatis.
              </p>
              <textarea
                value={coordsText}
                onChange={e => setCoordsText(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={'0,0\n120,0\n115,85\n5,80'}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                {SITEPLAN_PRESETS.map((preset, i) => (
                  <Button
                    key={preset.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setCoordsText(preset.coords.map(p => `${p[0]},${p[1]}`).join('\n'))}
                  >
                    Contoh {i + 1}
                  </Button>
                ))}
              </div>
              <OcrScanDialog onUse={text => setCoordsText(text)} />
              <p className="text-xs text-muted-foreground">
                Titik: {parsed.points.length}
                {parsedArea > 0 && <> · Luas: ±{fmt(parsedArea)} m²</>}
              </p>
              {boundaryCCW && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs">
                    <span className="text-muted-foreground">Jalan utama:</span>{' '}
                    <span className="font-semibold text-navy">
                      {frontageEdge != null ? `Sisi ${frontageEdge + 1}` : 'Otomatis (sisi terpanjang)'}
                    </span>
                  </p>
                  {result ? (
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setResult(null)}>
                      Pilih Sisi Jalan
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">klik sisi lahan di kanvas →</span>
                  )}
                </div>
              )}
              {(parsed.errors.length > 0 || genError) && (
                <p className="text-xs text-red-dk whitespace-pre-line">
                  {genError || parsed.errors.join('\n')}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-gold/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold" /> AI Baca Draft Konsep
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload foto coretan/draft perencanaan (mis. foto udara yang sudah ditandai zona).
                AI menganalisis layaknya arsitek berpengalaman lalu mengisi konsep &amp; parameter otomatis.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-dashed border-gold text-navy hover:bg-gold-lt"
                disabled={aiLoading}
                onClick={() => {
                  if (aiFileRef.current) aiFileRef.current.value = ''
                  aiFileRef.current?.click()
                }}
              >
                {aiLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Menganalisis draft…</>
                  : <><Sparkles className="h-4 w-4" /> Upload Draft / Coretan</>}
              </Button>
              <input
                ref={aiFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) void handleAiSketch(f)
                }}
              />
              {aiError && <p className="text-xs text-red-dk">{aiError}</p>}
              {aiResult && (
                <div className="space-y-2 text-xs bg-gold-lt/40 border border-gold/30 rounded-lg p-3">
                  <p><span className="font-bold text-navy">Konsep:</span> {aiResult.concept}</p>
                  <p><span className="font-bold text-navy">Jalan utama:</span> {aiResult.jalanUtama}</p>
                  {aiResult.zones.length > 0 && (
                    <div>
                      <p className="font-bold text-navy">Zona teridentifikasi:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {aiResult.zones.map((z, i) => (
                          <li key={i}><span className="font-semibold">{z.type}</span> — {z.posisi}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiResult.notes && <p className="text-muted-foreground italic">{aiResult.notes}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    Parameter sudah diterapkan. Tandai posisi jalan utama sesuai deskripsi di atas
                    dengan mengeklik sisi lahan di kanvas, lalu klik Generate Siteplan.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-gold" /> 2. Parameter
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-navy mb-2 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-gold" /> Konsep Pembangunan
                </p>
                <Select value={concept} onValueChange={v => setConcept(v as SiteplanConcept)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih konsep" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perumahan">Perumahan (kavling rumah)</SelectItem>
                    <SelectItem value="ruko">Ruko / Komersial</SelectItem>
                    <SelectItem value="apartemen">Apartemen (tower + parkir)</SelectItem>
                    <SelectItem value="hotel">Hotel (tower + parkir)</SelectItem>
                    <SelectItem value="mixed">Mixed-Use (ruko + rumah)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(concept === 'perumahan' || concept === 'mixed') && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Kavling Rumah</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lebar (m)</Label>
                    <Input type="number" value={lotW} min={3} step={0.5}
                      onChange={e => setLotW(+e.target.value || 6)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kedalaman (m)</Label>
                    <Input type="number" value={lotD} min={5} step={0.5}
                      onChange={e => setLotD(+e.target.value || 12)} />
                  </div>
                </div>
              </div>
              )}

              {(concept === 'apartemen' || concept === 'hotel') && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">
                  Tower {concept === 'hotel' ? 'Hotel' : 'Apartemen'}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lebar (m)</Label>
                    <Input type="number" value={towerW} min={10} step={1}
                      onChange={e => setTowerW(+e.target.value || 20)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dalam (m)</Label>
                    <Input type="number" value={towerD} min={10} step={1}
                      onChange={e => setTowerD(+e.target.value || 30)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jml. Tower</Label>
                    <Input type="number" value={towerCount} min={1} max={10}
                      onChange={e => setTowerCount(+e.target.value || 1)} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Sisa lahan otomatis menjadi area parkir, jalan, dan RTH.
                </p>
              </div>
              )}

              {(concept === 'ruko' || concept === 'mixed') && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">
                  Ruko{concept === 'mixed' ? ' (di frontage jalan utama)' : ''}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lebar (m)</Label>
                    <Input type="number" value={comW} min={3} step={0.5}
                      onChange={e => setComW(+e.target.value || 5)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dalam (m)</Label>
                    <Input type="number" value={comD} min={5} step={0.5}
                      onChange={e => setComD(+e.target.value || 15)} />
                  </div>
                  {concept === 'mixed' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Maks.</Label>
                    <Input type="number" value={comMax} min={1}
                      onChange={e => setComMax(+e.target.value || 10)} />
                  </div>
                  )}
                </div>
              </div>
              )}
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Jalan</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Jalan Utama (m)</Label>
                    <Input type="number" value={roadMain} min={4} step={0.5}
                      onChange={e => setRoadMain(+e.target.value || 8)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jalan Lingkungan (m)</Label>
                    <Input type="number" value={roadSec} min={3} step={0.5}
                      onChange={e => setRoadSec(+e.target.value || 6)} />
                  </div>
                  {!(concept === 'apartemen' || concept === 'hotel') && (
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Panjang Blok Maks. (m)</Label>
                    <Input type="number" value={blockMaxLen} min={20} step={5}
                      onChange={e => setBlockMaxLen(+e.target.value || 60)} />
                  </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-navy mb-2">
                  {concept === 'apartemen' || concept === 'hotel' ? 'RTH' : 'Fasum & RTH'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Target RTH (%)</Label>
                    <Input type="number" value={rthPct} min={0} max={60}
                      onChange={e => setRthPct(+e.target.value || 0)} />
                  </div>
                  {!(concept === 'apartemen' || concept === 'hotel') && (
                  <div className="space-y-1">
                    <Label className="text-xs">Target Fasum (%)</Label>
                    <Input type="number" value={fasumPct} min={0} max={40}
                      onChange={e => setFasumPct(+e.target.value || 0)} />
                  </div>
                  )}
                </div>
              </div>
              {concept === 'perumahan' && (
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-navy cursor-pointer">
                  <input
                    type="checkbox"
                    checked={comEnabled}
                    onChange={e => setComEnabled(e.target.checked)}
                    className="accent-gold h-4 w-4"
                  />
                  Sertakan ruko di jalan utama
                </label>
                {comEnabled && (
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Lebar (m)</Label>
                      <Input type="number" value={comW} min={3} step={0.5}
                        onChange={e => setComW(+e.target.value || 5)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Dalam (m)</Label>
                      <Input type="number" value={comD} min={5} step={0.5}
                        onChange={e => setComD(+e.target.value || 15)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Maks.</Label>
                      <Input type="number" value={comMax} min={1}
                        onChange={e => setComMax(+e.target.value || 10)} />
                    </div>
                  </div>
                )}
              </div>
              )}
            </CardContent>
          </Card>

          <Button className="w-full h-12 text-base font-bold bg-navy hover:bg-steel" onClick={handleGenerate}>
            Generate Siteplan
          </Button>

          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" size="sm" disabled={!result} className="gap-1"
              onClick={() => result && downloadPng(result)}>
              <FileImage className="h-3.5 w-3.5" /> PNG
            </Button>
            <Button variant="outline" size="sm" disabled={!result} className="gap-1"
              onClick={() => result && downloadDxf(result)}>
              <FileDown className="h-3.5 w-3.5" /> DXF
            </Button>
            <Button variant="outline" size="sm" disabled={!result} className="gap-1"
              onClick={() => result && downloadPdf(result)}>
              <FileText className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" disabled={!result} className="gap-1"
              onClick={() => rendererRef.current?.fitToView()}>
              <Maximize2 className="h-3.5 w-3.5" /> Fit
            </Button>
          </div>
        </div>

        {/* ============ AREA UTAMA ============ */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="relative flex-1 min-h-[420px] bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {tooltip && (
              <div
                className="absolute z-20 pointer-events-none bg-navy/95 text-white text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap"
                style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
              >
                {tooltip.text}
              </div>
            )}
            {!result && !boundaryCCW && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-muted-foreground gap-2 pointer-events-none p-6">
                <Map className="h-10 w-10 text-slate-300" />
                <p className="font-semibold text-navy">Belum ada siteplan.</p>
                <p className="text-sm">
                  Masukkan titik koordinat batas lahan (atau klik &quot;Contoh&quot;),
                  atur parameter, lalu klik <strong>Generate Siteplan</strong>.
                </p>
              </div>
            )}
          </div>

          {result && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Ringkasan Siteplan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-10 gap-y-3 items-start">
                  <div className="overflow-x-auto w-full lg:w-auto">
                  <table className="text-sm min-w-[380px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                        <th className="py-1.5 pr-6">Kategori</th>
                        <th className="py-1.5 pr-6 text-right">Jumlah</th>
                        <th className="py-1.5 pr-6 text-right">Luas (m²)</th>
                        <th className="py-1.5 text-right">Persen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryOrder.map(t => {
                        const s = result.stats.byType[t]
                        if (!s || s.area < 0.5) return null
                        const count = t === 'kavling' ? result.stats.counts.kavling
                          : t === 'komersial' ? result.stats.counts.komersial
                          : t === 'tower' ? result.stats.counts.tower : '—'
                        return (
                          <tr key={t} className="border-b border-slate-100">
                            <td className="py-1.5 pr-6">
                              <span
                                className="inline-block w-3 h-3 rounded-sm mr-2 align-[-1px] border border-black/15"
                                style={{ background: PARCEL_COLORS[t].fill }}
                              />
                              {PARCEL_TYPE_LABELS[t]}
                            </td>
                            <td className="py-1.5 pr-6 text-right">{count}</td>
                            <td className="py-1.5 pr-6 text-right">{fmt(s.area)}</td>
                            <td className="py-1.5 text-right">{s.pct.toFixed(1)}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td className="pt-2 pr-6">Total Luas Lahan</td>
                        <td />
                        <td className="pt-2 pr-6 text-right">{fmt(result.stats.totalAreaM2)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td colSpan={4} className="pt-1 font-bold text-navy">
                          Efisiensi Lahan (area terjual/terbangun): {result.stats.efficiencyPct.toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  </div>
                  {result.warnings.length > 0 && (
                    <div className="space-y-2 max-w-md">
                      {result.warnings.map((w, i) => (
                        <p key={i} className="text-xs bg-amber-lt text-amber rounded-md border border-amber/20 px-3 py-2">
                          ⚠️ {w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
