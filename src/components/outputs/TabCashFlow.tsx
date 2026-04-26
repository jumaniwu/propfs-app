import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { formatRupiah, formatRupiahAxis, formatPct } from '@/engine/formatter'
import type { FSResults, CashFlowPeriode } from '@/types/fs.types'

interface Props { results: FSResults }

type ViewMode = 'monthly' | 'quarterly' | 'annual'

const VIEW_LABELS: Record<ViewMode, string> = {
  monthly: 'Bulanan',
  quarterly: 'Kuartalan',
  annual: 'Tahunan',
}

export default function TabCashFlow({ results: r }: Props) {
  const [view, setView] = useState<ViewMode>('quarterly')
  const cf = r.cashFlow

  const data: CashFlowPeriode[] = cf[view]

  // Determine breakeven reference index
  const breakevenIdx = view === 'monthly'
    ? (cf.breakevenBulan ?? null)
    : view === 'quarterly'
    ? (cf.breakevenQuarter ?? null)
    : (cf.breakevenBulan ? Math.ceil(cf.breakevenBulan / 12) : null)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const p = payload[0]?.payload as CashFlowPeriode
    if (!p) return null
    return (
      <div className="bg-background border border-border rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[200px]">
        <div className="font-semibold text-sm">{p.label}</div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Penerimaan</span>
          <span className="font-mono text-green-700">{formatRupiah(p.penerimaan, true)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Biaya Bangun</span>
          <span className="font-mono text-red-700">({formatRupiah(p.biayaBangun, true)})</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Biaya Ops</span>
          <span className="font-mono text-red-700">({formatRupiah(p.biayaOperasional + p.biayaPersiapan, true)})</span>
        </div>
        <hr className="border-border" />
        <div className="flex justify-between gap-4 font-semibold">
          <span>Net CF</span>
          <span className={`font-mono ${p.netCF >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {formatRupiah(p.netCF, true)}
          </span>
        </div>
        <div className="flex justify-between gap-4 font-semibold">
          <span>Kumulatif</span>
          <span className={`font-mono ${p.kumulatif >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
            {formatRupiah(p.kumulatif, true)}
          </span>
        </div>
        <div className="flex justify-between gap-4 font-semibold pt-1 border-t border-border mt-1">
          <span className="text-purple-700">Piutang (AR)</span>
          <span className="font-mono text-purple-700">
            {formatRupiah(p.arBulanan, true)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex items-center gap-2">
        {(Object.keys(VIEW_LABELS) as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              view === v
                ? 'bg-navy text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPIStrip
          label="Breakeven"
          value={cf.breakevenQuarter ? `Q${cf.breakevenQuarter}` : cf.breakevenBulan ? `Bln ${cf.breakevenBulan}` : 'Belum BEP'}
          sub={cf.breakevenBulan ? `Bulan ke-${cf.breakevenBulan}` : 'Belum tercapai'}
          color={cf.breakevenBulan ? 'text-green-700' : 'text-red-600'}
        />
        <KPIStrip
          label="Peak Negative CF"
          value={formatRupiah(cf.peakNegativeCF, true)}
          sub="Maximum drawdown"
          color="text-red-700"
        />
        <KPIStrip
          label="Total Cash In"
          value={formatRupiah(cf.totalCashIn, true)}
          sub="Seluruh penerimaan"
          color="text-green-700"
        />
        <KPIStrip
          label="Total Cash Out"
          value={formatRupiah(cf.totalCashOut, true)}
          sub="Seluruh pengeluaran"
          color="text-slate-700"
        />
      </div>

      {/* Area chart: kumulatif */}
      <div>
        <h3 className="section-title text-sm">Kumulatif Cash Flow</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="gradKumulatif" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0D47A1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0D47A1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPenerimaan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1B5E20" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#1B5E20" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => formatRupiahAxis(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <ReferenceLine y={0} stroke="#888" strokeDasharray="4 4" />
            {breakevenIdx && (
              <ReferenceLine
                x={data[breakevenIdx - 1]?.label}
                stroke="#C9A84C"
                strokeWidth={2}
                strokeDasharray="6 3"
                label={{ value: 'BEP', position: 'top', fontSize: 11, fill: '#C9A84C' }}
              />
            )}
            <Area type="monotone" dataKey="penerimaan" name="Penerimaan" stroke="#1B5E20" fill="url(#gradPenerimaan)" strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="kumulatif" name="Net Kumulatif" stroke="#0D47A1" fill="url(#gradKumulatif)" strokeWidth={2.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Area chart: AR vs Kumulatif Modal */}
      <div>
        <div className="mb-2">
          <h3 className="section-title text-sm mb-0">Analisis Modal: AR (Piutang) vs Net Kumulatif</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Visualisasi aset Piutang KPR/Bertahap terhadap posisi Defisit Modal, berguna menentukan kapan suntik modal.
          </p>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="gradKumulatif2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0D47A1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0D47A1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAR" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6B21A8" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6B21A8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => formatRupiahAxis(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <ReferenceLine y={0} stroke="#888" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="arBulanan" name="Piutang (AR)" stroke="#6B21A8" fill="url(#gradAR)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="kumulatif" name="Net Kumulatif" stroke="#0D47A1" fill="url(#gradKumulatif2)" strokeWidth={2.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bar chart: net per periode */}
      <div>
        <h3 className="section-title text-sm">Net Cash Flow per Periode</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => formatRupiahAxis(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#888" />
            <Bar dataKey="netCF" name="Net CF" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.netCF >= 0 ? '#1B5E20' : '#B71C1C'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="table-container">
        <h3 className="section-title text-sm">Tabel Detail Cash Flow</h3>
        <div className="overflow-x-auto rounded-xl border border-border max-h-80 print:max-h-none overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-navy text-white">
                {['Periode', 'Penerimaan', 'Biaya Bangun', 'Biaya Persiapan', 'Biaya Ops', 'Net CF', 'Kumulatif', 'Piutang (AR)'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right first:text-left font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{row.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-green-700 whitespace-nowrap">{formatRupiah(row.penerimaan, true)}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-700 whitespace-nowrap">({formatRupiah(row.biayaBangun, true)})</td>
                  <td className="px-3 py-2 text-right font-mono text-red-700 whitespace-nowrap">({formatRupiah(row.biayaPersiapan, true)})</td>
                  <td className="px-3 py-2 text-right font-mono text-red-700 whitespace-nowrap">({formatRupiah(row.biayaOperasional, true)})</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold whitespace-nowrap ${row.netCF >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatRupiah(row.netCF, true)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold whitespace-nowrap ${row.kumulatif >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {formatRupiah(row.kumulatif, true)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-purple-700 border-l border-border/50 whitespace-nowrap">
                    {formatRupiah(row.arBulanan, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KPIStrip({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono font-bold text-sm mt-1 ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>
    </div>
  )
}
