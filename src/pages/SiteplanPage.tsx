/**
 * Design Siteplan — input titik koordinat batas lahan, siteplan terbentuk
 * otomatis: kavling, jalan, fasum, RTH, ruko. Export PNG / DXF / PDF.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map, FileImage, FileText, FileDown, Maximize2, Settings2, Building2, Sparkles, Loader2, Save, FolderOpen, Trash2 } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import OcrScanDialog from '@/components/siteplan/OcrScanDialog'
import RenderMasterplanDialog from '@/components/siteplan/RenderMasterplanDialog'
import CadRenderDialog from '@/components/siteplan/CadRenderDialog'
import NumInput from '@/components/siteplan/NumInput'
import { SiteplanRenderer, PARCEL_COLORS, PARCEL_TYPE_LABELS } from '@/components/siteplan/SiteplanRenderer.ts'
import { downloadPng, downloadPdf } from '@/components/siteplan/exportImage.ts'
import { downloadDxf } from '@/engine/siteplan/exportDxf.ts'
import { ensureCCW, polygonArea } from '@/engine/siteplan/geometry.ts'
import { analyzeConceptSketch, type AIKonsepResult } from '@/lib/ai-siteplan.ts'
import { useSiteplanStore, type SavedSiteplan } from '@/store/siteplanStore.ts'
import { toast } from '@/hooks/use-toast'
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
  const [mixTowerEnabled, setMixTowerEnabled] = useState(false)
  const [mixRumah, setMixRumah] = useState(true)
  const [mixRuko, setMixRuko] = useState(true)
  const [mixPlaza, setMixPlaza] = useState(false)
  const [plazaW, setPlazaW] = useState(30)
  const [plazaD, setPlazaD] = useState(20)
  const [lotMax, setLotMax] = useState(0) // 0 = tanpa batas
  const [floorRumah, setFloorRumah] = useState(1)
  const [floorRuko, setFloorRuko] = useState(2)
  const [floorTower, setFloorTower] = useState(12)
  const [sketchDataUrl, setSketchDataUrl] = useState<string | null>(null)
  const [roadStyle, setRoadStyle] = useState<'loop' | 'grid'>('loop')
  const [gatePct, setGatePct] = useState(50)
  const [bufferM, setBufferM] = useState(3)
  const [lotW2, setLotW2] = useState(0) // 0 = tipe kedua nonaktif
  const [lotW2Pct, setLotW2Pct] = useState(30)
  const [alternatives, setAlternatives] = useState<Array<{
    key: 'loop' | 'grid'; label: string; result: SiteplanResult
  }>>([])

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

  const designs = useSiteplanStore(s => s.designs)
  const saveDesign = useSiteplanStore(s => s.saveDesign)
  const deleteDesign = useSiteplanStore(s => s.deleteDesign)

  function handleSave() {
    if (!result) return
    const defaultName = `Desain ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · ${concept}`
    const name = window.prompt('Nama desain:', defaultName)
    if (name === null) return
    const units = result.stats.counts.kavling + result.stats.counts.komersial + result.stats.counts.tower
    saveDesign({
      name: name.trim() || defaultName,
      coordsText,
      concept,
      frontageEdge,
      form: { lotW, lotD, roadMain, roadSec, blockMaxLen, rthPct, fasumPct, comEnabled, comW, comD, comMax, towerW, towerD, towerCount, mixTowerEnabled, mixRumah, mixRuko, mixPlaza, plazaW, plazaD, roadStyle, gatePct, bufferM, lotW2, lotW2Pct, lotMax },
      summary: { totalAreaM2: result.stats.totalAreaM2, units, efficiencyPct: result.stats.efficiencyPct },
    })
    toast({ title: 'Desain tersimpan', description: 'Buka kembali dari daftar "Desain Tersimpan".' })
  }

  function loadDesign(d: SavedSiteplan) {
    // pulihkan seluruh form
    setCoordsText(d.coordsText)
    setConcept(d.concept)
    setFrontageEdge(d.frontageEdge)
    const f = d.form
    setLotW(f.lotW); setLotD(f.lotD)
    setRoadMain(f.roadMain); setRoadSec(f.roadSec); setBlockMaxLen(f.blockMaxLen)
    setRthPct(f.rthPct); setFasumPct(f.fasumPct)
    setComEnabled(f.comEnabled); setComW(f.comW); setComD(f.comD); setComMax(f.comMax)
    setTowerW(f.towerW); setTowerD(f.towerD); setTowerCount(f.towerCount)
    setMixTowerEnabled(f.mixTowerEnabled ?? false)
    setMixRumah(f.mixRumah ?? true); setMixRuko(f.mixRuko ?? true); setMixPlaza(f.mixPlaza ?? false)
    setPlazaW(f.plazaW ?? 30); setPlazaD(f.plazaD ?? 20)
    setRoadStyle(f.roadStyle ?? 'grid'); setGatePct(f.gatePct ?? 50)
    setBufferM(f.bufferM ?? 3); setLotW2(f.lotW2 ?? 0); setLotW2Pct(f.lotW2Pct ?? 30)
    setLotMax(f.lotMax ?? 0)
    // generate ulang langsung dari data tersimpan (state belum tentu ter-apply)
    setGenError('')
    try {
      const pts = parseManualCoords(d.coordsText).points
      const res = generateSiteplan(pts, {
        lot: { w: f.lotW, d: f.lotD, maxCount: (f.lotMax ?? 0) > 0 ? f.lotMax : undefined },
        road: { main: f.roadMain, secondary: f.roadSec },
        rthPct: f.rthPct, fasumPct: f.fasumPct,
        commercial: { enabled: f.comEnabled, w: f.comW, d: f.comD, maxCount: f.comMax },
        blockMaxLen: f.blockMaxLen,
        concept: d.concept,
        tower: { w: f.towerW, d: f.towerD, count: f.towerCount },
        plaza: { w: f.plazaW ?? 30, d: f.plazaD ?? 20 },
        roadStyle: f.roadStyle ?? 'grid',
        gateT: Math.min(0.9, Math.max(0.1, (f.gatePct ?? 50) / 100)),
        perimeterBuffer: f.bufferM ?? 3,
        lotTypes: (f.lotW2 ?? 0) >= 3 && (f.lotW2Pct ?? 0) > 0
          ? [
              { name: `T${f.lotW}`, w: f.lotW, pct: 100 - (f.lotW2Pct ?? 30) },
              { name: `T${f.lotW2}`, w: f.lotW2!, pct: f.lotW2Pct ?? 30 },
            ]
          : undefined,
        mix: d.concept === 'mixed'
          ? {
              rumah: f.mixRumah ?? true,
              ruko: f.mixRuko ?? true,
              tower: f.mixTowerEnabled ?? false,
              plaza: f.mixPlaza ?? false,
            }
          : undefined,
        frontageEdge: d.frontageEdge,
      })
      setAlternatives([])
      showResult(res)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleAiSketch(file: File) {
    setAiError('')
    setAiLoading(true)
    try {
      // simpan coretan sebagai referensi render
      const reader = new FileReader()
      reader.onload = () => setSketchDataUrl(String(reader.result))
      reader.readAsDataURL(file)

      const res = await analyzeConceptSketch(file, boundaryCCW)
      setAiResult(res)
      setConcept(res.concept)
      if (res.jalanUtamaEdge != null) setFrontageEdge(res.jalanUtamaEdge)
      if (res.units.rumah) setLotMax(res.units.rumah)
      if (res.units.ruko) setComMax(res.units.ruko)
      if (res.floors.rumah) setFloorRumah(res.floors.rumah)
      if (res.floors.ruko) setFloorRuko(res.floors.ruko)
      if (res.floors.tower) setFloorTower(res.floors.tower)
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

  function buildParams(styleOverride?: 'loop' | 'grid') {
    return {
      lot: { w: lotW, d: lotD, maxCount: lotMax > 0 ? lotMax : undefined },
      road: { main: roadMain, secondary: roadSec },
      rthPct, fasumPct,
      commercial: { enabled: comEnabled, w: comW, d: comD, maxCount: comMax },
      blockMaxLen,
      concept,
      tower: { w: towerW, d: towerD, count: towerCount },
      plaza: { w: plazaW, d: plazaD },
      mix: concept === 'mixed'
        ? { rumah: mixRumah, ruko: mixRuko, tower: mixTowerEnabled, plaza: mixPlaza }
        : undefined,
      frontageEdge,
      roadStyle: styleOverride ?? roadStyle,
      gateT: Math.min(0.9, Math.max(0.1, gatePct / 100)),
      perimeterBuffer: bufferM,
      lotTypes: lotW2 >= 3 && lotW2Pct > 0
        ? [
            { name: `T${lotW}`, w: lotW, pct: 100 - lotW2Pct },
            { name: `T${lotW2}`, w: lotW2, pct: lotW2Pct },
          ]
        : undefined,
    }
  }

  function showResult(res: SiteplanResult) {
    setResult(res)
    // canvas baru terukur setelah panel ringkasan dirender → fit pada frame berikutnya
    requestAnimationFrame(() => {
      const r = rendererRef.current
      if (!r) return
      r.resize()
      r.setData(res)
      r.fitToView()
    })
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
    // dua alternatif desain: loop keliling vs grid — user tinggal memilih
    const alts: Array<{ key: 'loop' | 'grid'; label: string; result: SiteplanResult }> = []
    let firstError = ''
    for (const key of ['loop', 'grid'] as const) {
      try {
        alts.push({
          key,
          label: key === 'loop' ? 'Loop Keliling' : 'Grid',
          result: generateSiteplan(parsed.points, buildParams(key)),
        })
      } catch (e) {
        if (!firstError) firstError = e instanceof Error ? e.message : String(e)
      }
    }
    if (alts.length === 0) {
      setGenError(firstError || 'Gagal membuat siteplan.')
      return
    }
    setAlternatives(alts)
    const preferred = alts.find(a => a.key === roadStyle) ?? alts[0]
    showResult(preferred.result)
  }

  const summaryOrder: ParcelType[] = ['kavling', 'komersial', 'tower', 'plaza', 'parkir', 'jalan', 'fasum', 'rth']

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header breadcrumbs={[{ label: 'AI Architect' }]} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 p-4 max-w-[1800px] w-full mx-auto">
        {/* ============ SIDEBAR ============ */}
        <div className="space-y-4 lg:overflow-y-auto lg:max-h-[calc(100vh-120px)] pr-1">
          <Card className="border-gold">
            <CardContent className="pt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Sudah punya siteplan dari arsitek? Upload file AutoCAD (DXF), PDF, atau gambar —
                AI membaca denah, menanyakan konsep (jenis bangunan, lantai, gaya), lalu me-render.
              </p>
              <CadRenderDialog />
            </CardContent>
          </Card>

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
                    <SelectItem value="mixed">Mixed-Use (pilih komponen)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {concept === 'mixed' && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Komponen Mixed-Use</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['Rumah (kavling)', mixRumah, setMixRumah],
                    ['Ruko', mixRuko, setMixRuko],
                    ['Tower Apartemen', mixTowerEnabled, setMixTowerEnabled],
                    ['Foodcourt / Plaza', mixPlaza, setMixPlaza],
                  ] as Array<[string, boolean, (v: boolean) => void]>).map(([label, val, setter]) => (
                    <label key={label} className="flex items-center gap-2 text-xs font-semibold text-navy cursor-pointer border border-border rounded-lg px-2.5 py-2">
                      <input type="checkbox" checked={val}
                        onChange={e => setter(e.target.checked)}
                        className="accent-gold h-4 w-4" />
                      {label}
                    </label>
                  ))}
                </div>
                {!mixRumah && !mixRuko && !mixTowerEnabled && !mixPlaza && (
                  <p className="text-xs text-red-dk mt-1.5">Pilih minimal satu komponen.</p>
                )}
              </div>
              )}

              {(concept === 'perumahan' || (concept === 'mixed' && mixRumah)) && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Kavling Rumah</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lebar (m)</Label>
                    <NumInput value={lotW} onValue={setLotW} min={3} step={0.5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kedalaman (m)</Label>
                    <NumInput value={lotD} onValue={setLotD} min={5} step={0.5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Maks. Unit</Label>
                    <NumInput value={lotMax} onValue={setLotMax} min={0} placeholder="0 = bebas" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipe 2 — Lebar (m, 0=off)</Label>
                    <NumInput value={lotW2} onValue={setLotW2} min={0} step={0.5} placeholder="mis. 7" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Proporsi Tipe 2 (%)</Label>
                    <NumInput value={lotW2Pct} onValue={setLotW2Pct} min={5} max={90} />
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
                    <NumInput value={towerW} onValue={setTowerW} min={10} step={1} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dalam (m)</Label>
                    <NumInput value={towerD} onValue={setTowerD} min={10} step={1} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jml. Tower</Label>
                    <NumInput value={towerCount} onValue={setTowerCount} min={1} max={10} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Sisa lahan otomatis menjadi area parkir, jalan, dan RTH.
                </p>
              </div>
              )}

              {(concept === 'ruko' || (concept === 'mixed' && mixRuko)) && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">
                  Ruko{concept === 'mixed' ? ' (di frontage jalan utama)' : ''}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lebar (m)</Label>
                    <NumInput value={comW} onValue={setComW} min={3} step={0.5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dalam (m)</Label>
                    <NumInput value={comD} onValue={setComD} min={5} step={0.5} />
                  </div>
                  {concept === 'mixed' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Maks.</Label>
                    <NumInput value={comMax} onValue={setComMax} min={1} />
                  </div>
                  )}
                </div>
              </div>
              )}

              {concept === 'mixed' && mixTowerEnabled && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Tower Apartemen (frontage)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lebar (m)</Label>
                    <NumInput value={towerW} onValue={setTowerW} min={10} step={1} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dalam (m)</Label>
                    <NumInput value={towerD} onValue={setTowerD} min={10} step={1} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jml. Tower</Label>
                    <NumInput value={towerCount} onValue={setTowerCount} min={1} max={10} />
                  </div>
                </div>
              </div>
              )}

              {concept === 'mixed' && mixPlaza && (
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Foodcourt / Commercial Plaza</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lebar (m)</Label>
                    <NumInput value={plazaW} onValue={setPlazaW} min={10} step={1} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dalam (m)</Label>
                    <NumInput value={plazaD} onValue={setPlazaD} min={10} step={1} />
                  </div>
                </div>
              </div>
              )}
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Jalan &amp; Gerbang</p>
                <div className="space-y-1 mb-3">
                  <Label className="text-xs">Pola Jaringan Jalan</Label>
                  <Select value={roadStyle} onValueChange={v => setRoadStyle(v as 'loop' | 'grid')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loop">Loop keliling + boulevard (ala arsitek)</SelectItem>
                      <SelectItem value="grid">Grid lurus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Jalan Utama (m)</Label>
                    <NumInput value={roadMain} onValue={setRoadMain} min={4} step={0.5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jalan Lingkungan (m)</Label>
                    <NumInput value={roadSec} onValue={setRoadSec} min={3} step={0.5} />
                  </div>
                  {!(concept === 'apartemen' || concept === 'hotel') && (
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Panjang Blok Maks. (m)</Label>
                    <NumInput value={blockMaxLen} onValue={setBlockMaxLen} min={20} step={5} />
                  </div>
                  )}
                  {roadStyle === 'loop' && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Posisi Gerbang (%)</Label>
                      <NumInput value={gatePct} onValue={setGatePct} min={10} max={90} step={5} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Buffer Hijau Keliling (m)</Label>
                      <NumInput value={bufferM} onValue={setBufferM} min={1} max={10} step={0.5} />
                    </div>
                  </>
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
                    <NumInput value={rthPct} onValue={setRthPct} min={0} max={60} />
                  </div>
                  {!(concept === 'apartemen' || concept === 'hotel') && (
                  <div className="space-y-1">
                    <Label className="text-xs">Target Fasum (%)</Label>
                    <NumInput value={fasumPct} onValue={setFasumPct} min={0} max={40} />
                  </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-navy mb-2">Lantai Bangunan (untuk render)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Rumah</Label>
                    <NumInput value={floorRumah} onValue={setFloorRumah} min={1} max={3} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ruko</Label>
                    <NumInput value={floorRuko} onValue={setFloorRuko} min={1} max={5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tower</Label>
                    <NumInput value={floorTower} onValue={setFloorTower} min={4} max={50} />
                  </div>
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
                      <NumInput value={comW} onValue={setComW} min={3} step={0.5} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Dalam (m)</Label>
                      <NumInput value={comD} onValue={setComD} min={5} step={0.5} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Maks.</Label>
                      <NumInput value={comMax} onValue={setComMax} min={1} />
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

          <Button variant="outline" disabled={!result} className="w-full gap-2 border-gold text-navy hover:bg-gold-lt"
            onClick={handleSave}>
            <Save className="h-4 w-4" /> Simpan Desain
          </Button>

          <RenderMasterplanDialog
            result={result}
            initialFloors={{ rumah: floorRumah, ruko: floorRuko, tower: floorTower }}
            sketchDataUrl={sketchDataUrl}
          />

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

          {designs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-gold" /> Desain Tersimpan ({designs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {designs.map(d => (
                  <div key={d.id} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0"
                      onClick={() => loadDesign(d)}
                    >
                      <p className="text-xs font-bold text-navy truncate">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(d.savedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}{d.summary.units} unit · {fmt(d.summary.totalAreaM2)} m²
                      </p>
                    </button>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-dk"
                      title="Hapus desain"
                      onClick={() => {
                        if (window.confirm(`Hapus desain "${d.name}"?`)) deleteDesign(d.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
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

          {result && alternatives.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-navy">Alternatif Desain:</span>
              {alternatives.map(a => {
                const active = a.result === result
                const units = a.result.stats.counts.kavling + a.result.stats.counts.komersial + a.result.stats.counts.tower
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => showResult(a.result)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      active ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:bg-slate-50'
                    }`}
                  >
                    {a.label} · {units} unit · efisiensi {a.result.stats.efficiencyPct.toFixed(0)}%
                  </button>
                )
              })}
            </div>
          )}

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
