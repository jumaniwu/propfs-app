import { useState, useMemo } from 'react'
import {
  TrendingUp, Info, Download, Printer, SlidersHorizontal,
  ArrowUp, ArrowDown, Minus, Target, Clock, AlertTriangle,
  CheckCircle2, BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'
import ProgressInputPanel from './ProgressInputPanel'
import * as xlsx from 'xlsx'

type InnerTab = 'kurva' | 'progress'

export default function TabKurvaS() {
  const { activePlan, projectInfo, updateSCurveConfig, getActualProgressPct, getTotalRealisasi } = useCostStore()
  const [innerTab, setInnerTab] = useState<InnerTab>('kurva')
  const [durasiProyek, setDurasiProyek] = useState(projectInfo?.targetDurationMonths || 12)
  const isGenerated = projectInfo?.isSCurveGenerated || false

  const totalRAB = activePlan?.totalBaselineBudget ?? 0
  const totalRealisasi = getTotalRealisasi()
  const actualProgressPct = getActualProgressPct()

  // ── Chart Data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!isGenerated || !activePlan) return []
    const total = activePlan.totalBaselineBudget
    if (total === 0) return []

    const months = Array.from({ length: durasiProyek }, (_, i) => i + 1)

    // Sigmoid-like distribution for planned curve
    const weights = months.map(m => {
      const x = (m / durasiProyek) * 10 - 5
      return 1 / (1 + Math.exp(-x))
    })
    const incremental = weights.map((w, i) => i === 0 ? w : w - weights[i - 1])
    const incSum = incremental.reduce((s, v) => s + v, 0)

    let cumulativePlan = 0

    // Determine how many months have "passed" based on actual progress
    // We project actual progress linearly across elapsed time
    const projectStart = projectInfo?.startDate ? new Date(projectInfo.startDate) : new Date()
    const now = new Date()
    const monthsElapsed = Math.max(0,
      (now.getFullYear() - projectStart.getFullYear()) * 12 +
      (now.getMonth() - projectStart.getMonth())
    )

    return months.map((m, i) => {
      const monthlyBudget = (incremental[i] / incSum) * total
      cumulativePlan += monthlyBudget

      // Actual: interpolate progress linearly up to current month
      let actualPct: number | null = null
      let actualBudget: number | null = null

      if (monthsElapsed > 0 && m <= Math.min(monthsElapsed + 1, durasiProyek)) {
        // Linear projection of actual progress to this month
        const progressThisMonth = Math.min(
          actualProgressPct * (m / Math.max(monthsElapsed, 1)),
          actualProgressPct
        )
        actualPct = parseFloat(Math.min(progressThisMonth, 100).toFixed(1))
        actualBudget = Math.round((progressThisMonth / 100) * total)
      }

      return {
        bulan: `Bln ${m}`,
        rencanaBudget: Math.round(cumulativePlan),
        rencanaPersentase: parseFloat(((cumulativePlan / total) * 100).toFixed(1)),
        aktualBudget: actualBudget,
        aktualPersentase: actualPct,
        isCurrentMonth: m === monthsElapsed + 1
      }
    })
  }, [isGenerated, activePlan, durasiProyek, actualProgressPct, projectInfo])

  // ── Analytics ──────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (!isGenerated || chartData.length === 0 || totalRAB === 0) return null

    // Find current month data point
    const projectStart = projectInfo?.startDate ? new Date(projectInfo.startDate) : new Date()
    const now = new Date()
    const monthsElapsed = Math.max(0,
      (now.getFullYear() - projectStart.getFullYear()) * 12 +
      (now.getMonth() - projectStart.getMonth())
    )

    const currentIdx = Math.min(monthsElapsed, chartData.length - 1)
    const currentPoint = chartData[currentIdx]

    const plannedValuePct = currentPoint?.rencanaPersentase ?? 0
    const earnedValuePct = actualProgressPct

    // SPI = EV% / PV%
    const spi = plannedValuePct > 0 ? earnedValuePct / plannedValuePct : 1

    // SPI-based status
    let status: 'ahead' | 'on_track' | 'behind'
    if (spi >= 1.05) status = 'ahead'
    else if (spi >= 0.95) status = 'on_track'
    else status = 'behind'

    // Forecast completion (if behind: needs more months)
    const remainingProgress = 100 - earnedValuePct
    const progressRate = monthsElapsed > 0 ? earnedValuePct / monthsElapsed : 0
    const forecastMonthsRemaining = progressRate > 0
      ? Math.ceil(remainingProgress / progressRate)
      : durasiProyek - monthsElapsed
    const forecastTotalMonths = monthsElapsed + forecastMonthsRemaining

    // Budget deviation
    const costPct = totalRAB > 0 ? (totalRealisasi / totalRAB) * 100 : 0
    const deviasi = costPct - earnedValuePct

    return {
      spi: parseFloat(spi.toFixed(2)),
      status,
      plannedValuePct: parseFloat(plannedValuePct.toFixed(1)),
      earnedValuePct: parseFloat(earnedValuePct.toFixed(1)),
      selisihPct: parseFloat((earnedValuePct - plannedValuePct).toFixed(1)),
      selisihRp: Math.round(((earnedValuePct - plannedValuePct) / 100) * totalRAB),
      forecastTotalMonths,
      monthsElapsed,
      costPct: parseFloat(costPct.toFixed(1)),
      deviasi: parseFloat(deviasi.toFixed(1)),
    }
  }, [isGenerated, chartData, actualProgressPct, totalRAB, totalRealisasi, projectInfo, durasiProyek])

  const formatRp = (val: number) => `Rp ${(val / 1_000_000).toFixed(1)} Jt`

  const handleGenerate = () => updateSCurveConfig(durasiProyek, true)

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (chartData.length === 0) return
    const wb = xlsx.utils.book_new()
    const data = chartData.map(d => ({
      'Periode': d.bulan,
      'Rencana Kumulatif (Rp)': d.rencanaBudget,
      'Rencana (%)': d.rencanaPersentase,
      'Aktual Kumulatif (Rp)': d.aktualBudget ?? '-',
      'Aktual (%)': d.aktualPersentase ?? '-',
    }))
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(data), 'Kurva S')
    if (analytics) {
      const metricsData = [
        { 'Metrik': 'SPI (Schedule Performance Index)', 'Nilai': analytics.spi },
        { 'Metrik': 'Status Proyek', 'Nilai': analytics.status === 'ahead' ? 'Ahead of Schedule' : analytics.status === 'on_track' ? 'On Track' : 'Behind Schedule' },
        { 'Metrik': 'Progress Rencana (%)', 'Nilai': analytics.plannedValuePct },
        { 'Metrik': 'Progress Aktual (%)', 'Nilai': analytics.earnedValuePct },
        { 'Metrik': 'Selisih Progress (%)', 'Nilai': analytics.selisihPct },
        { 'Metrik': 'Selisih Nilai (Rp)', 'Nilai': analytics.selisihRp },
        { 'Metrik': 'Forecast Selesai (Bulan)', 'Nilai': analytics.forecastTotalMonths },
      ]
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(metricsData), 'Analisa SPI')
    }
    xlsx.writeFile(wb, `KurvaS_${projectInfo?.projectName ?? 'Proyek'}_${new Date().toLocaleDateString('id-ID').replace(/\//g, '')}.xlsx`)
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Inner Tab Switcher */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
        <button
          onClick={() => setInnerTab('kurva')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            innerTab === 'kurva' ? 'bg-white shadow-sm text-navy' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Kurva S
        </button>
        <button
          onClick={() => setInnerTab('progress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            innerTab === 'progress' ? 'bg-white shadow-sm text-navy' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" /> Input Progress
        </button>
      </div>

      {/* ══ TAB: Input Progress ════════════════════════════════════════════ */}
      {innerTab === 'progress' && <ProgressInputPanel />}

      {/* ══ TAB: Kurva S ══════════════════════════════════════════════════ */}
      {innerTab === 'kurva' && (
        <>
          {/* Config Panel */}
          <div className="bg-muted/30 border border-border rounded-2xl p-6 print:hidden">
            <h3 className="font-semibold mb-1 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-navy" /> Konfigurasi Time Schedule
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tentukan target durasi proyek. Kurva rencana menggunakan distribusi sigmoid standar.
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <label className="block text-sm font-medium mb-1">Durasi Proyek</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={3} max={60} value={durasiProyek}
                    onChange={e => {
                      setDurasiProyek(Number(e.target.value))
                      updateSCurveConfig(Number(e.target.value), false)
                    }}
                    className="w-40"
                  />
                  <span className="font-bold text-navy w-24">{durasiProyek} Bulan</span>
                </div>
              </div>
              <Button className="bg-navy hover:bg-navy/90 gap-2" onClick={handleGenerate}>
                <TrendingUp className="h-4 w-4" /> Generate Kurva S
              </Button>
            </div>
          </div>

          {!isGenerated && (
            <div className="py-16 text-center print:hidden">
              <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">Klik "Generate Kurva S" untuk menampilkan grafik distribusi anggaran.</p>
            </div>
          )}

          {isGenerated && chartData.length > 0 && (
            <div className="space-y-6">
              {/* Info Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-blue-50 text-blue-700 rounded-xl px-4 py-3 text-sm print:hidden">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    🟡 Garis kuning: Rencana · 🔵 Garis biru: Aktual (berdasarkan progress input) · Durasi <strong>{durasiProyek} bulan</strong>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="bg-white gap-2 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={exportCSV}>
                    <Download className="h-4 w-4" /> Excel (CSV)
                  </Button>
                  <Button size="sm" variant="outline" className="bg-white gap-2 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" /> Export PDF
                  </Button>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-white border border-border rounded-2xl p-6 overflow-x-auto">
                <h3 className="font-semibold mb-1">Kurva S — Distribusi Anggaran Kumulatif</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Total Anggaran: Rp {activePlan?.totalBaselineBudget.toLocaleString('id-ID')}
                  {actualProgressPct > 0 && (
                    <span className="ml-3 text-blue-600 font-medium">
                      · Progress Aktual: {actualProgressPct.toFixed(1)}%
                    </span>
                  )}
                </p>
                <div style={{ minWidth: 500 }}>
                  <ResponsiveContainer width="100%" height={380}>
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="pct"
                        orientation="right"
                        tickFormatter={v => `${v}%`}
                        tick={{ fontSize: 11 }}
                        domain={[0, 100]}
                      />
                      <YAxis
                        yAxisId="rp"
                        orientation="left"
                        tickFormatter={formatRp}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(val: any, name: string) => {
                          if (name.includes('%')) return val !== null ? [`${val}%`, name] : ['-', name]
                          return val !== null ? [`Rp ${Number(val).toLocaleString('id-ID')}`, name] : ['-', name]
                        }}
                      />
                      <Legend />
                      {/* Rencana Budget */}
                      <Line
                        yAxisId="rp" type="monotone" dataKey="rencanaBudget"
                        name="Rencana (Rp)" stroke="#C9A84C" strokeWidth={2}
                        strokeDasharray="6 3" dot={false}
                      />
                      {/* Rencana % */}
                      <Line
                        yAxisId="pct" type="monotone" dataKey="rencanaPersentase"
                        name="Rencana (%)" stroke="#C9A84C" strokeWidth={1.5}
                        strokeDasharray="3 3" dot={false} opacity={0.5}
                      />
                      {/* Aktual Budget */}
                      <Line
                        yAxisId="rp" type="monotone" dataKey="aktualBudget"
                        name="Aktual (Rp)" stroke="#2563eb" strokeWidth={2.5}
                        dot={{ r: 3, fill: '#2563eb' }} connectNulls={false}
                      />
                      {/* Aktual % */}
                      <Line
                        yAxisId="pct" type="monotone" dataKey="aktualPersentase"
                        name="Aktual (%)" stroke="#2563eb" strokeWidth={1.5}
                        dot={false} connectNulls={false} opacity={0.6}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* SPI Analytics Cards */}
              {analytics && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-navy flex items-center gap-2">
                    <Target className="w-4 h-4" /> Analisa Performa Proyek
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* SPI */}
                    <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">SPI</p>
                      <p className={`text-2xl font-bold ${analytics.spi >= 1 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {analytics.spi}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Schedule Performance Index</p>
                    </div>

                    {/* Status */}
                    <div className={`border rounded-2xl p-4 shadow-sm ${
                      analytics.status === 'ahead' ? 'bg-emerald-50 border-emerald-200' :
                      analytics.status === 'on_track' ? 'bg-blue-50 border-blue-200' :
                      'bg-red-50 border-red-200'
                    }`}>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Status</p>
                      <div className="flex items-center gap-1.5">
                        {analytics.status === 'ahead' && <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><p className="font-bold text-emerald-700 text-sm">Ahead of Schedule</p></>}
                        {analytics.status === 'on_track' && <><Minus className="w-4 h-4 text-blue-600" /><p className="font-bold text-blue-700 text-sm">On Track</p></>}
                        {analytics.status === 'behind' && <><AlertTriangle className="w-4 h-4 text-red-500" /><p className="font-bold text-red-700 text-sm">Behind Schedule</p></>}
                      </div>
                    </div>

                    {/* Selisih Progress */}
                    <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Selisih Progress</p>
                      <div className={`flex items-center gap-1 ${analytics.selisihPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {analytics.selisihPct >= 0
                          ? <ArrowUp className="w-4 h-4" />
                          : <ArrowDown className="w-4 h-4" />
                        }
                        <p className="text-xl font-bold">{analytics.selisihPct >= 0 ? '+' : ''}{analytics.selisihPct}%</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {analytics.selisihRp >= 0 ? '+' : ''}Rp {analytics.selisihRp.toLocaleString('id-ID')}
                      </p>
                    </div>

                    {/* Forecast */}
                    <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Forecast Selesai</p>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-navy" />
                        <p className="text-xl font-bold text-navy">{analytics.forecastTotalMonths} Bln</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {analytics.forecastTotalMonths > durasiProyek
                          ? `Perkiraan melebihi target ${analytics.forecastTotalMonths - durasiProyek} bulan`
                          : analytics.forecastTotalMonths < durasiProyek
                          ? `Perkiraan selesai ${durasiProyek - analytics.forecastTotalMonths} bulan lebih awal`
                          : 'Sesuai target durasi'
                        }
                      </p>
                    </div>
                  </div>

                  {/* Progress comparison bar */}
                  <div className="bg-white border border-border rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-navy">Perbandingan Progress</p>
                      <p className="text-xs text-muted-foreground">Bulan ke-{analytics.monthsElapsed} dari {durasiProyek}</p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-amber-600">🟡 Rencana</span>
                          <span className="font-bold">{analytics.plannedValuePct}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3">
                          <div className="bg-amber-400 h-3 rounded-full transition-all" style={{ width: `${analytics.plannedValuePct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-blue-600">🔵 Aktual</span>
                          <span className="font-bold">{analytics.earnedValuePct}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3">
                          <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${analytics.earnedValuePct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground font-medium">
                    <tr>
                      <th className="px-4 py-3 text-left">Periode</th>
                      <th className="px-4 py-3 text-right">Rencana Kumulatif</th>
                      <th className="px-4 py-3 text-right">Rencana (%)</th>
                      <th className="px-4 py-3 text-right">Aktual Kumulatif</th>
                      <th className="px-4 py-3 text-right">Aktual (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {chartData.map(row => (
                      <tr key={row.bulan} className={`hover:bg-muted/30 ${row.isCurrentMonth ? 'bg-blue-50/50' : ''}`}>
                        <td className="px-4 py-2.5 font-medium">
                          {row.bulan}
                          {row.isCurrentMonth && (
                            <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">Skrg</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">Rp {row.rencanaBudget.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-muted rounded-full h-1.5">
                              <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${row.rencanaPersentase}%` }} />
                            </div>
                            <span>{row.rencanaPersentase}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-blue-700 font-medium">
                          {row.aktualBudget !== null ? `Rp ${row.aktualBudget.toLocaleString('id-ID')}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.aktualPersentase !== null ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5">
                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${row.aktualPersentase}%` }} />
                              </div>
                              <span className="text-blue-700 font-medium">{row.aktualPersentase}%</span>
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
