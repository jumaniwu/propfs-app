import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Printer, Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import { formatRupiah, formatPct } from '@/engine/formatter'
import { exportToPDF } from '@/utils/export'
import { toast } from '@/hooks/use-toast'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

export default function CostReportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { projectInfo, activePlan, realisasiEntries, getActualProgressPct, getTotalRealisasi, setProject } = useCostStore()

  useEffect(() => {
    // If we land here directly, we must ensure project is loaded.
    // Assuming project is loaded via state. If not, we could fetch from DB.
    if (!projectInfo) {
      // For now, if no project in store, go back to cost-control dashboard
      navigate('/cost-control')
    }
  }, [id, projectInfo, navigate])

  useEffect(() => {
    if (searchParams.get('print') === 'true') {
      // Small delay to ensure charts are rendered
      setTimeout(() => window.print(), 1000)
    }
  }, [searchParams])

  if (!projectInfo || !activePlan) {
    return <div className="p-10 text-center">Loading...</div>
  }

  const totalRAB = activePlan.totalBaselineBudget
  const totalRealisasi = getTotalRealisasi()
  const actualProgressPct = getActualProgressPct()
  
  // ── Kurva S Data Logic ──
  const durasiProyek = projectInfo.targetDurationMonths || 12
  const isGenerated = projectInfo.isSCurveGenerated || false

  const chartData = useMemo(() => {
    if (!isGenerated) return []
    const total = totalRAB
    if (total === 0) return []

    const months = Array.from({ length: durasiProyek }, (_, i) => i + 1)
    const weights = months.map(m => 1 / (1 + Math.exp(-((m / durasiProyek) * 10 - 5))))
    const incremental = weights.map((w, i) => i === 0 ? w : w - weights[i - 1])
    const incSum = incremental.reduce((s, v) => s + v, 0)

    let cumulativePlan = 0
    const projectStart = projectInfo.startDate ? new Date(projectInfo.startDate) : new Date()
    const now = new Date()
    const monthsElapsed = Math.max(0, (now.getFullYear() - projectStart.getFullYear()) * 12 + (now.getMonth() - projectStart.getMonth()))

    return months.map((m, i) => {
      const monthlyBudget = (incremental[i] / incSum) * total
      cumulativePlan += monthlyBudget

      let actualPct: number | null = null
      let actualBudget: number | null = null

      if (monthsElapsed > 0 && m <= Math.min(monthsElapsed + 1, durasiProyek)) {
        const progressThisMonth = Math.min(actualProgressPct * (m / Math.max(monthsElapsed, 1)), actualProgressPct)
        actualPct = parseFloat(Math.min(progressThisMonth, 100).toFixed(1))
        actualBudget = Math.round((progressThisMonth / 100) * total)
      }

      return {
        bulan: `Bln ${m}`,
        rencanaBudget: Math.round(cumulativePlan),
        rencanaPersentase: parseFloat(((cumulativePlan / total) * 100).toFixed(1)),
        aktualBudget: actualBudget,
        aktualPersentase: actualPct,
      }
    })
  }, [isGenerated, totalRAB, durasiProyek, actualProgressPct, projectInfo])

  const analytics = useMemo(() => {
    if (!isGenerated || chartData.length === 0 || totalRAB === 0) return null

    const projectStart = projectInfo.startDate ? new Date(projectInfo.startDate) : new Date()
    const now = new Date()
    const monthsElapsed = Math.max(0, (now.getFullYear() - projectStart.getFullYear()) * 12 + (now.getMonth() - projectStart.getMonth()))

    const currentIdx = Math.min(monthsElapsed, chartData.length - 1)
    const currentPoint = chartData[currentIdx]

    const plannedValuePct = currentPoint?.rencanaPersentase ?? 0
    const earnedValuePct = actualProgressPct

    const spi = plannedValuePct > 0 ? earnedValuePct / plannedValuePct : 1
    const cpi = totalRealisasi > 0 ? ((earnedValuePct / 100 * totalRAB) / totalRealisasi) : 1
    const eac = cpi > 0 ? totalRAB / cpi : totalRAB

    const deviasi = (totalRAB > 0 ? (totalRealisasi / totalRAB) * 100 : 0) - earnedValuePct

    return {
      spi: parseFloat(spi.toFixed(2)),
      cpi: parseFloat(cpi.toFixed(2)),
      eac,
      plannedValuePct,
      earnedValuePct,
      deviasi: parseFloat(deviasi.toFixed(1)),
      sisaAnggaran: totalRAB - totalRealisasi
    }
  }, [isGenerated, chartData, actualProgressPct, totalRAB, totalRealisasi, projectInfo])

  const groupedRAB = activePlan.components.reduce((acc, c) => {
    const g = c.groupName || 'Lainnya'; if (!acc[g]) acc[g] = []; acc[g].push(c); return acc
  }, {} as Record<string, typeof activePlan.components>)

  async function handleExportPDF() {
    toast({ title: '🖨 Dialog Print akan terbuka', description: 'Gunakan layout Landscape untuk hasil terbaik.' })
    setTimeout(() => window.print(), 500)
  }

  return (
    <>
      <div className="no-print sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-4 py-2 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="default" size="sm" onClick={() => window.print()} className="bg-navy hover:bg-navy/90 gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { margin: 15mm 20mm; size: landscape; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background-color: white !important; }
          .no-print { display: none !important; }
          #report-content { width: 100% !important; max-width: 100% !important; margin: 0 !important; }
          .page-break { page-break-before: always; }
          .cover-page { height: 100vh !important; display: flex; flex-direction: column; justify-content: center; }
        }
      `}} />

      <div id="report-content" className="bg-white text-gray-900 max-w-[1100px] mx-auto pb-20">
        
        {/* ── Page 1: Cover ── */}
        <div className="cover-page min-h-screen flex flex-col justify-between p-16 bg-navy text-white">
          <div>
            <div className="w-16 h-16 bg-gold rounded-2xl flex items-center justify-center mb-6">
              <span className="font-serif font-bold text-navy text-2xl">P</span>
            </div>
            <div className="text-gold text-sm font-medium uppercase tracking-widest mb-2">Cost Control Executive Report</div>
          </div>
          <div className="space-y-6">
            <h1 className="font-serif text-5xl font-bold leading-tight">{projectInfo.projectName}</h1>
            <div className="space-y-2 text-white/80 text-lg">
              <p>📍 {projectInfo.location || 'Lokasi Proyek'}</p>
              <p>💰 Total Anggaran: {formatRupiah(totalRAB)}</p>
            </div>
          </div>
          <div className="border-t border-white/20 pt-6 flex justify-between text-white/50 text-sm">
            <span>PropFS Project Management System</span>
            <span>Dicetak: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        {/* ── Page 2: Executive Summary & KPI ── */}
        <div className="page-break p-10 space-y-6">
          <div className="flex justify-between items-end border-b-2 border-gold pb-3">
            <div>
              <h2 className="font-serif text-2xl font-bold text-navy">Executive Summary</h2>
              <p className="text-muted-foreground text-sm">Ringkasan Performa Anggaran & Waktu</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-navy/5 p-4 rounded-xl border border-navy/10">
              <p className="text-sm text-muted-foreground mb-1">Total RAB</p>
              <p className="font-bold text-xl text-navy">{formatRupiah(totalRAB)}</p>
            </div>
            <div className="bg-navy/5 p-4 rounded-xl border border-navy/10">
              <p className="text-sm text-muted-foreground mb-1">Total Realisasi</p>
              <p className="font-bold text-xl text-navy">{formatRupiah(totalRealisasi)}</p>
            </div>
            <div className={`p-4 rounded-xl border ${analytics?.sisaAnggaran && analytics.sisaAnggaran < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-sm text-muted-foreground mb-1">Sisa Anggaran</p>
              <p className={`font-bold text-xl ${analytics?.sisaAnggaran && analytics.sisaAnggaran < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatRupiah(analytics?.sisaAnggaran || 0)}
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${analytics?.deviasi && analytics.deviasi > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-sm text-muted-foreground mb-1">Deviasi Cost</p>
              <p className={`font-bold text-xl ${analytics?.deviasi && analytics.deviasi > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {(analytics?.deviasi || 0) > 0 ? '+' : ''}{analytics?.deviasi || 0}%
              </p>
            </div>
          </div>

          {analytics && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white border rounded-xl p-5 text-center">
                <p className="text-sm font-semibold text-muted-foreground">SPI (Schedule)</p>
                <p className={`text-3xl font-bold mt-2 ${analytics.spi >= 1 ? 'text-green-600' : 'text-red-600'}`}>{analytics.spi}</p>
                <p className="text-xs text-muted-foreground mt-1">{analytics.spi >= 1 ? 'On/Ahead Schedule' : 'Behind Schedule'}</p>
              </div>
              <div className="bg-white border rounded-xl p-5 text-center">
                <p className="text-sm font-semibold text-muted-foreground">CPI (Cost)</p>
                <p className={`text-3xl font-bold mt-2 ${analytics.cpi >= 1 ? 'text-green-600' : 'text-red-600'}`}>{analytics.cpi}</p>
                <p className="text-xs text-muted-foreground mt-1">{analytics.cpi >= 1 ? 'Under/On Budget' : 'Over Budget'}</p>
              </div>
              <div className="bg-white border rounded-xl p-5 text-center">
                <p className="text-sm font-semibold text-muted-foreground">EAC (Forecast)</p>
                <p className="text-2xl font-bold mt-2 text-navy">{formatRupiah(analytics.eac)}</p>
                <p className="text-xs text-muted-foreground mt-1">Estimasi Total Akhir</p>
              </div>
            </div>
          )}

          {/* RAB Summary Table */}
          <h3 className="font-serif text-xl font-bold text-navy mt-8 mb-4">Struktur Anggaran (RAB)</h3>
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-navy text-white">
                <th className="p-3 border">Kategori Pekerjaan</th>
                <th className="p-3 border text-center">Item</th>
                <th className="p-3 border text-right">Nilai Anggaran (Rp)</th>
                <th className="p-3 border text-right">% dari Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedRAB).map(([g, items], i) => {
                const sub = items.reduce((s, c) => s + c.totalPlannedCost, 0)
                const pct = totalRAB > 0 ? (sub / totalRAB) * 100 : 0
                return (
                  <tr key={g} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-3 border">{g.toUpperCase()}</td>
                    <td className="p-3 border text-center">{items.length}</td>
                    <td className="p-3 border text-right font-medium">{formatRupiah(sub, false)}</td>
                    <td className="p-3 border text-right">{pct.toFixed(2)}%</td>
                  </tr>
                )
              })}
              <tr className="bg-gold/20 font-bold">
                <td className="p-3 border">GRAND TOTAL</td>
                <td className="p-3 border text-center">{activePlan.components.length}</td>
                <td className="p-3 border text-right text-navy">{formatRupiah(totalRAB, false)}</td>
                <td className="p-3 border text-right">100.00%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Page 3: Kurva S & Realisasi ── */}
        <div className="page-break p-10 space-y-6">
          <div className="flex justify-between items-end border-b-2 border-gold pb-3">
            <div>
              <h2 className="font-serif text-2xl font-bold text-navy">Kurva S & Aktual Progress</h2>
              <p className="text-muted-foreground text-sm">Visualisasi Rencana Anggaran vs Realisasi Lapangan</p>
            </div>
          </div>

          {!isGenerated ? (
            <div className="py-20 text-center border-2 border-dashed rounded-xl">
              <p className="text-muted-foreground">Kurva S belum digenerate di Dashboard Cost Control.</p>
            </div>
          ) : (
            <>
              <div className="h-[400px] w-full mt-6 mb-8 border rounded-xl p-4 bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="bulan" tick={{ fontSize: 12, fill: '#6b7280' }} />
                    <YAxis tickFormatter={val => `${val}%`} domain={[0, 100]} tick={{ fontSize: 12, fill: '#6b7280' }} width={45} />
                    <Tooltip formatter={(value: number) => [`${value}%`, '']} labelStyle={{ color: '#1a2744', fontWeight: 'bold' }} />
                    <Legend />
                    <Line type="monotone" dataKey="rencanaPersentase" name="Rencana (%)" stroke="#c9a84c" strokeWidth={3} strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="aktualPersentase" name="Aktual (%)" stroke="#1a2744" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Data Table Kurva S */}
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-navy/5 text-navy">
                    <th className="p-2 border border-navy/10 text-center">Bulan</th>
                    {chartData.map(d => <th key={d.bulan} className="p-2 border border-navy/10 text-center">{d.bulan.replace('Bln ', '')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border border-navy/10 font-bold bg-gold/10 text-navy text-right">Rencana (%)</td>
                    {chartData.map(d => <td key={d.bulan} className="p-2 border border-navy/10 text-center">{d.rencanaPersentase}%</td>)}
                  </tr>
                  <tr>
                    <td className="p-2 border border-navy/10 font-bold bg-navy text-white text-right">Aktual (%)</td>
                    {chartData.map(d => (
                      <td key={d.bulan} className={`p-2 border border-navy/10 text-center font-medium ${d.aktualPersentase === null ? 'text-gray-300' : ''}`}>
                        {d.aktualPersentase !== null ? `${d.aktualPersentase}%` : '-'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 border border-navy/10 font-bold text-right">Selisih (%)</td>
                    {chartData.map(d => {
                      if (d.aktualPersentase === null) return <td key={d.bulan} className="p-2 border border-navy/10 text-center text-gray-300">-</td>
                      const diff = parseFloat((d.aktualPersentase - d.rencanaPersentase).toFixed(1))
                      return (
                        <td key={d.bulan} className={`p-2 border border-navy/10 text-center font-bold ${diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {diff > 0 ? '+' : ''}{diff}%
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </>
  )
}
