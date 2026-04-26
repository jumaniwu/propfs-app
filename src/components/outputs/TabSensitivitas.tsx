import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatPct } from '@/engine/formatter'
import type { FSResults, SensitivityCell } from '@/types/fs.types'

interface Props { results: FSResults }

const CHANGES = [-20, -10, 0, 10, 20]

function getCellStyle(margin: number): string {
  if (margin >= 25) return 'bg-green-700 text-white'
  if (margin >= 20) return 'bg-green-500 text-white'
  if (margin >= 15) return 'bg-green-300 text-green-900'
  if (margin >= 10) return 'bg-amber-300 text-amber-900'
  if (margin >= 5)  return 'bg-orange-400 text-white'
  if (margin >= 0)  return 'bg-red-400 text-white'
  return 'bg-red-700 text-white'
}

export default function TabSensitivitas({ results: r }: Props) {
  const matrix = r.sensitivityMatrix

  // Tornado chart: single variable sensitivity
  const tornadoBiaya = CHANGES.map(change => {
    const adjCost    = r.totalInvestment * (1 + change / 100)
    const netProfit  = r.grossRevenue - adjCost - r.totalPotongan
    const netMargin  = r.grossRevenue > 0 ? (netProfit / r.grossRevenue) * 100 : 0
    return { name: `Biaya ${change >= 0 ? '+' : ''}${change}%`, netMargin, type: 'cost' }
  })

  const tornadoRevenue = CHANGES.map(change => {
    const adjRev    = r.grossRevenue * (1 + change / 100)
    const netProfit = adjRev - r.totalInvestment - (r.totalPotongan * (adjRev / r.grossRevenue || 1))
    const netMargin = adjRev > 0 ? (netProfit / adjRev) * 100 : 0
    return { name: `Revenue ${change >= 0 ? '+' : ''}${change}%`, netMargin, type: 'revenue' }
  })

  const tornadoData = [...tornadoBiaya, ...tornadoRevenue]
    .sort((a, b) => Math.abs(b.netMargin - r.netMargin) - Math.abs(a.netMargin - r.netMargin))
    .slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Heatmap */}
      <div>
        <h3 className="section-title text-sm">Heatmap Sensitivitas (Net Margin %)</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Baris = % kenaikan biaya | Kolom = % kenaikan harga jual
        </p>

        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Column headers (revenue changes) */}
            <div className="flex mb-1 ml-20">
              {CHANGES.map(rc => (
                <div key={rc} className="w-24 text-center text-xs font-medium text-muted-foreground">
                  Harga {rc >= 0 ? '+' : ''}{rc}%
                </div>
              ))}
            </div>

            {/* Rows (biaya changes) */}
            {matrix.map((row, ri) => (
              <div key={ri} className="flex items-center mb-1">
                {/* Row label */}
                <div className="w-20 text-right pr-3 text-xs font-medium text-muted-foreground shrink-0">
                  Biaya {CHANGES[ri] >= 0 ? '+' : ''}{CHANGES[ri]}%
                </div>
                {row.map((cell, ci) => (
                  <div
                    key={ci}
                    className={`w-24 h-16 flex flex-col items-center justify-center rounded-md mx-0.5 cursor-default transition-transform hover:scale-105 ${getCellStyle(cell.netMargin)}`}
                    title={`Biaya ${CHANGES[ri]}%, Revenue ${CHANGES[ci]}% → Net Margin: ${cell.netMargin.toFixed(1)}%`}
                  >
                    <span className="font-mono font-bold text-base">{cell.netMargin.toFixed(1)}%</span>
                    <span className="text-xs opacity-80">
                      {cell.status === 'sangat_layak' ? '✓✓' : cell.status === 'layak' ? '✓' : '✗'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { label: '≥ 25%', cls: 'bg-green-700 text-white' },
            { label: '20–25%', cls: 'bg-green-500 text-white' },
            { label: '15–20%', cls: 'bg-green-300 text-green-900' },
            { label: '10–15%', cls: 'bg-amber-300 text-amber-900' },
            { label: '5–10%', cls: 'bg-orange-400 text-white' },
            { label: '0–5%', cls: 'bg-red-400 text-white' },
            { label: '< 0%', cls: 'bg-red-700 text-white' },
          ].map(({ label, cls }) => (
            <div key={label} className={`px-2.5 py-1 rounded text-xs font-medium ${cls}`}>{label}</div>
          ))}
        </div>
      </div>

      {/* Tornado chart */}
      <div>
        <h3 className="section-title text-sm">Tornado Chart — Variabel Paling Sensitif</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Dampak setiap perubahan ±20% terhadap Net Margin (baseline: {formatPct(r.netMargin)})
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            layout="vertical"
            data={tornadoData}
            margin={{ top: 5, right: 40, left: 110, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(1)}% net margin`]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar dataKey="netMargin" radius={[0, 4, 4, 0]}>
              {tornadoData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.netMargin >= 20 ? '#1B5E20' : entry.netMargin >= 10 ? '#E65100' : '#B71C1C'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Base case note */}
      <div className="bg-muted/30 rounded-xl p-4 text-sm">
        <div className="font-semibold mb-2">Base Case (0% perubahan)</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="text-muted-foreground">Net Margin</span>
            <div className="font-mono font-bold">{formatPct(r.netMargin)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Gross Revenue</span>
            <div className="font-mono font-bold">{formatPct(r.grossRevenue / r.grossRevenue * 100)} dari GR</div>
          </div>
          <div>
            <span className="text-muted-foreground">Total Cost / GR</span>
            <div className="font-mono font-bold">{formatPct(r.totalInvestment / r.grossRevenue * 100)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
