import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatRupiah, CHART_COLORS, FASE_COLORS } from '@/engine/formatter'
import {
  calcBiayaPersiapan, calcBiayaOperasional,
  calcBiayaPersiapanPerM2, calcBiayaOpsPerM2,
  calcHargaJualBangunan, calcHargaJualKavling,
  getSellingEntities
} from '@/engine/calculator'
import type { FSInputs, PenjualanPerFase } from '@/types/fs.types'

interface Props {
  inputs: FSInputs
  onChange: (partial: Partial<FSInputs>) => void
}

export default function Step6SimulasiPenjualan({ inputs, onChange }: Props) {
  const entities = useMemo(() => getSellingEntities(inputs), [inputs.tipeBangunan])

  const totalBP  = useMemo(() => calcBiayaPersiapan(inputs), [inputs])
  const totalBO  = useMemo(() => calcBiayaOperasional(inputs), [inputs])
  const bpPerM2  = useMemo(() => calcBiayaPersiapanPerM2(entities, totalBP), [entities, totalBP])
  const boPerM2  = useMemo(() => calcBiayaOpsPerM2(entities, totalBO), [entities, totalBO])

  // Harga per tipe per fase
  const hargaMap = useMemo(() => {
    const map: Record<string, Record<number, number>> = {}
    for (const tipe of entities) {
      map[tipe.id] = {}
      for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
        map[tipe.id][fase] =
          calcHargaJualBangunan(tipe, fase) + calcHargaJualKavling(tipe, bpPerM2, boPerM2)
      }
    }
    return map
  }, [inputs, bpPerM2, boPerM2])

  function getUnit(tipeId: string, fase: number): number {
    return inputs.penjualan.find(p => p.tipeId === tipeId && p.fase === fase)?.unitTerjual ?? 0
  }

  function setUnit(tipeId: string, fase: number, val: number) {
    const tipe = entities.find(t => t.id === tipeId)
    if (!tipe) return
    const maxUnit = tipe.jumlahUnit
    const totalSudah = Array.from({ length: inputs.jumlahFase }, (_, i) => i + 1)
      .filter(f => f !== fase)
      .reduce((s, f) => s + getUnit(tipeId, f), 0)
    const clamped = Math.min(val, maxUnit - totalSudah, maxUnit)

    const newPenjualan = inputs.penjualan.filter(p => !(p.tipeId === tipeId && p.fase === fase))
    if (clamped > 0) newPenjualan.push({ tipeId, fase, unitTerjual: clamped })
    onChange({ penjualan: newPenjualan })
  }

  // Chart data: unit terjual per fase per tipe
  const chartData = useMemo(() => {
    return Array.from({ length: inputs.jumlahFase }, (_, fi) => {
      const fase = fi + 1
      const row: Record<string, number | string> = { name: `Fase ${fase}` }
      for (const tipe of entities) {
        row[tipe.nama || tipe.id] = getUnit(tipe.id, fase)
      }
      return row
    })
  }, [inputs])

  // Summary totals
  const summary = useMemo(() => {
    return entities.map(tipe => {
      let unitTerjualTotal = 0
      let pendapatanTotal  = 0
      for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
        const unit = getUnit(tipe.id, fase)
        const harga = hargaMap[tipe.id]?.[fase] ?? 0
        unitTerjualTotal += unit
        pendapatanTotal  += unit * harga
      }
      return {
        tipe,
        unitTerjualTotal,
        sisaUnit: tipe.jumlahUnit - unitTerjualTotal,
        pendapatanTotal,
      }
    })
  }, [inputs, hargaMap])

  const grossRevenueSim = summary.reduce((s, x) => s + x.pendapatanTotal, 0)

  if (entities.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Tambahkan tipe bangunan di Step 3 terlebih dahulu.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Input table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white">
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider">Tipe</th>
              <th className="px-3 py-3 text-center text-xs uppercase tracking-wider">Total Unit</th>
              {Array.from({ length: inputs.jumlahFase }, (_, i) => (
                <th key={i} className="px-3 py-3 text-center text-xs uppercase tracking-wider">
                  Fase {i + 1}
                </th>
              ))}
              <th className="px-3 py-3 text-center text-xs uppercase tracking-wider">Terjual</th>
              <th className="px-3 py-3 text-center text-xs uppercase tracking-wider">Sisa</th>
              <th className="px-3 py-3 text-right text-xs uppercase tracking-wider">Penerimaan</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((tipe, i) => {
              const s = summary[i]
              const isOver = s.sisaUnit < 0
              return (
                <tr key={tipe.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="px-3 py-2 font-medium">{tipe.nama}</td>
                  <td className="px-3 py-2 text-center font-mono">{tipe.jumlahUnit}</td>
                  {Array.from({ length: inputs.jumlahFase }, (_, fi) => {
                    const fase = fi + 1
                    const unit = getUnit(tipe.id, fase)
                    return (
                      <td key={fi} className="px-3 py-2 text-center">
                        <input
                          type="number"
                          value={unit || ''}
                          onChange={e => setUnit(tipe.id, fase, parseInt(e.target.value) || 0)}
                          min={0}
                          max={tipe.jumlahUnit}
                          placeholder="0"
                          className={`w-16 h-8 rounded-md border text-center text-sm font-mono focus:ring-2 focus:ring-green-400 focus:outline-none ${
                            isOver ? 'border-red-300 bg-red-50' : 'border-input bg-background'
                          }`}
                        />
                      </td>
                    )
                  })}
                  <td className={`px-3 py-2 text-center font-mono font-semibold ${s.sisaUnit < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {s.unitTerjualTotal}
                  </td>
                  <td className={`px-3 py-2 text-center font-mono ${s.sisaUnit < 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                    {s.sisaUnit}
                    {s.sisaUnit < 0 && ' ⚠'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {formatRupiah(s.pendapatanTotal, true)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-navy/5 border-t-2 border-navy/20 font-bold">
              <td className="px-3 py-3 text-navy dark:text-gold">TOTAL</td>
              <td className="px-3 py-3 text-center font-mono">
                {entities.reduce((s, t) => s + t.jumlahUnit, 0)}
              </td>
              {Array.from({ length: inputs.jumlahFase }, (_, fi) => (
                <td key={fi} className="px-3 py-3 text-center font-mono">
                  {entities.reduce((s, t) => s + getUnit(t.id, fi + 1), 0)}
                </td>
              ))}
              <td className="px-3 py-3 text-center font-mono">
                {summary.reduce((s, x) => s + x.unitTerjualTotal, 0)}
              </td>
              <td className="px-3 py-3 text-center font-mono">
                {summary.reduce((s, x) => s + x.sisaUnit, 0)}
              </td>
              <td className="px-3 py-3 text-right font-mono text-navy dark:text-gold">
                {formatRupiah(grossRevenueSim, true)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-muted/20 rounded-xl p-4">
          <p className="text-sm font-medium mb-3 text-muted-foreground">Unit Terjual per Fase per Tipe</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {entities.map((t, i) => (
                <Bar key={t.id} dataKey={t.nama || t.id} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gross Revenue preview */}
      <div className="bg-navy/5 dark:bg-navy/20 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Estimasi Gross Revenue</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">(berdasarkan simulasi penjualan ini)</p>
        </div>
        <div className="font-mono font-bold text-2xl text-navy dark:text-gold">
          {formatRupiah(grossRevenueSim, true)}
        </div>
      </div>

      {/* Skema Cara Pembayaran Konsumen */}
      <div className="border border-border p-5 rounded-xl space-y-5 bg-background">
        <div>
          <h3 className="font-semibold text-base mb-1 text-navy dark:text-gold">Skema Cara Pembayaran Konsumen</h3>
          <p className="text-sm text-muted-foreground">Proporsi estimasi tipe pembayaran yang akan dipilih pembeli. (Total harus 100%)</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Cash Keras */}
          <div className="space-y-3 bg-muted/20 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Tunai / Cash Keras</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={inputs.skemaPembayaran?.pctCashKeras || 0}
                onChange={e => onChange({ skemaPembayaran: { ...inputs.skemaPembayaran, pctCashKeras: Number(e.target.value) } })}
                className="w-20 px-3 py-2 border border-input rounded-md font-mono text-center"
              />
              <span className="text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Diterima lunas 100% pada bulan terjadinya penjualan.</p>
          </div>

          {/* Cash Bertahap */}
          <div className="space-y-3 bg-muted/20 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Cash Bertahap</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={inputs.skemaPembayaran?.pctCashBertahap || 0}
                onChange={e => onChange({ skemaPembayaran: { ...inputs.skemaPembayaran, pctCashBertahap: Number(e.target.value) } })}
                className="w-20 px-3 py-2 border border-input rounded-md font-mono text-center"
              />
              <span className="text-sm">%</span>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <label className="text-xs font-medium block mb-1">Durasi Cicilan (Bulan)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={inputs.skemaPembayaran?.durasiCashBertahap || 12}
                  onChange={e => onChange({ skemaPembayaran: { ...inputs.skemaPembayaran, durasiCashBertahap: Number(e.target.value) } })}
                  className="w-20 px-3 py-1.5 border border-input rounded-md font-mono text-center text-sm"
                />
                <span className="text-xs text-muted-foreground">x Bulan</span>
              </div>
            </div>
          </div>

          {/* KPR */}
          <div className="space-y-3 bg-muted/20 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Kredit Bank (KPR)</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={inputs.skemaPembayaran?.pctKPR || 0}
                onChange={e => onChange({ skemaPembayaran: { ...inputs.skemaPembayaran, pctKPR: Number(e.target.value) } })}
                className="w-20 px-3 py-2 border border-input rounded-md font-mono text-center"
              />
              <span className="text-sm">%</span>
            </div>
            
            <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Uang Muka (DP %)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={inputs.skemaPembayaran?.dpKPR || 0}
                    onChange={e => onChange({ skemaPembayaran: { ...inputs.skemaPembayaran, dpKPR: Number(e.target.value) } })}
                    className="w-full px-2 py-1.5 border border-input rounded-md font-mono text-center text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Dicicil (Bulan)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={inputs.skemaPembayaran?.durasiCicilDPKPR || 1}
                    onChange={e => onChange({ skemaPembayaran: { ...inputs.skemaPembayaran, durasiCicilDPKPR: Number(e.target.value) } })}
                    className="w-full px-2 py-1.5 border border-input rounded-md font-mono text-center text-sm"
                  />
                </div>
              </div>
              <div className="col-span-2 text-[10px] text-muted-foreground leading-tight mt-1">
                Plafon KPR cair dari Bank di bulan setelah DP lunas.
              </div>
            </div>
          </div>
        </div>

        {/* Validation Bar */}
        <div className="pt-2">
          {(() => {
            const total = (inputs.skemaPembayaran?.pctCashKeras || 0) + 
                          (inputs.skemaPembayaran?.pctCashBertahap || 0) + 
                          (inputs.skemaPembayaran?.pctKPR || 0)
            const isError = total !== 100
            
            return (
              <div className={`p-3 rounded-lg flex items-center justify-between text-sm ${isError ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'}`}>
                <span className="font-medium">Total Proporsi Pembayaran:</span>
                <span className="font-mono font-bold flex items-center gap-2">
                  {total}%
                  {isError && <span>(Perbaiki agar total 100%)</span>}
                  {!isError && <span>✓ Valid</span>}
                </span>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
