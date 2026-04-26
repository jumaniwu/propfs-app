import { useState, useMemo } from 'react'
import { TrendingUp, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function TabKurvaS() {
  const { activePlan, projectInfo } = useCostStore()
  const [durasiProyek, setDurasiProyek] = useState(projectInfo?.targetDurationMonths || 12) // ambil dari info project
  const [generated, setGenerated] = useState(false)

  const chartData = useMemo(() => {
    if (!generated || !activePlan) return []

    const total = activePlan.totalBaselineBudget
    if (total === 0) return []

    // Distribusi bobot S-Curve: pola bell/normal yang menghasilkan bentuk S
    // Pembagian % kumulatif per bulan menggunakan kurva sigmoid sederhana
    const months = Array.from({ length: durasiProyek }, (_, i) => i + 1)

    // Sigmoid-like distribution
    const weights = months.map(m => {
      const x = (m / durasiProyek) * 10 - 5 // normalize ke -5..5
      return 1 / (1 + Math.exp(-x)) // sigmoid
    })

    // Hitung incremental (selisih sigmoid - shaping to bell)
    const incremental = weights.map((w, i) => i === 0 ? w : w - weights[i - 1])
    const incSum = incremental.reduce((s, v) => s + v, 0)

    let cumulative = 0
    return months.map((m, i) => {
      const monthlyBudget = (incremental[i] / incSum) * total
      cumulative += monthlyBudget
      return {
        bulan: `Bln ${m}`,
        rencanaBudget: Math.round(cumulative),
        rencanaPersentase: parseFloat(((cumulative / total) * 100).toFixed(1)),
        realisasiPersentase: null, // placeholder untuk data aktual nanti
      }
    })
  }, [generated, activePlan, durasiProyek])

  const formatRp = (val: number) => `Rp ${(val / 1_000_000).toFixed(1)} Jt`

  return (
    <div className="space-y-8">
      {/* Config Panel */}
      <div className="bg-muted/30 border border-border rounded-2xl p-6">
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-navy" />
          Konfigurasi Time Schedule
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Tentukan target durasi proyek. Sistem akan mendistribusikan anggaran secara otomatis menggunakan pola Kurva S standar.
        </p>

        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <label className="block text-sm font-medium mb-1">Durasi Proyek</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={60}
                value={durasiProyek}
                onChange={e => { setDurasiProyek(Number(e.target.value)); setGenerated(false) }}
                className="w-40"
              />
              <span className="font-bold text-navy w-24">{durasiProyek} Bulan</span>
            </div>
          </div>

          <Button className="bg-navy hover:bg-navy/90 gap-2" onClick={() => setGenerated(true)}>
            <TrendingUp className="h-4 w-4" /> Generate Kurva S
          </Button>
        </div>
      </div>

      {/* Chart */}
      {!generated && (
        <div className="py-16 text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground text-sm">Klik "Generate Kurva S" untuk menampilkan grafik distribusi anggaran.</p>
        </div>
      )}

      {generated && chartData.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-xl px-4 py-3 text-sm">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              Grafik menampilkan distribusi anggaran kumulatif (Rencana S-Curve) selama <strong>{durasiProyek} bulan</strong>.
              Data Realisasi Aktual akan muncul setelah Anda menginput pengeluaran di tab <em>Realisasi Biaya</em>.
            </span>
          </div>

          <div className="bg-white border border-border rounded-2xl p-6">
            <h3 className="font-semibold mb-1">Kurva S — Distribusi Anggaran Kumulatif</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Total Anggaran: Rp {activePlan?.totalBaselineBudget.toLocaleString('id-ID')}
            </p>

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
                    if (name === 'Rencana (%)') return [`${val}%`, name]
                    return [`Rp ${Number(val).toLocaleString('id-ID')}`, name]
                  }}
                />
                <Legend />
                <Line
                  yAxisId="rp"
                  type="monotone"
                  dataKey="rencanaBudget"
                  name="Rencana (Rp)"
                  stroke="#1e3a5f"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="rencanaPersentase"
                  name="Rencana (%)"
                  stroke="#c9a84c"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabel ringkas */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Periode</th>
                  <th className="px-4 py-3 text-right">Rencana Kumulatif</th>
                  <th className="px-4 py-3 text-right">Progres (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {chartData.map(row => (
                  <tr key={row.bulan} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{row.bulan}</td>
                    <td className="px-4 py-2.5 text-right">Rp {row.rencanaBudget.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className="bg-navy h-2 rounded-full"
                            style={{ width: `${row.rencanaPersentase}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground">{row.rencanaPersentase}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
