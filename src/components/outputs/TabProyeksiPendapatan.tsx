import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { formatRupiah, formatRupiahAxis, CHART_COLORS } from '@/engine/formatter'
import type { FSResults, FSInputs } from '@/types/fs.types'

interface Props {
  results: FSResults
  inputs: FSInputs
}

export default function TabProyeksiPendapatan({ results: r, inputs }: Props) {
  // Flatten products so Apartments are split by unit
  const products = inputs.tipeBangunan.flatMap(t => {
    if (t.kategori === 'apartemen' && t.tipeUnit) {
      return t.tipeUnit.map(u => ({ id: u.id, nama: `${t.nama} - ${u.nama}`, parentId: t.id }))
    }
    return [{ id: t.id, nama: t.nama, parentId: t.id }]
  })

  // Penerimaan per fase per tipe — grouped bar
  const faseData = Array.from({ length: inputs.jumlahFase }, (_, fi) => {
    const fase = fi + 1
    const row: Record<string, number | string> = { name: `Fase ${fase}` }
    for (const prod of products) {
      const p = r.penerimaanPerFase.find(x => x.tipeId === prod.id && x.fase === fase)
      row[prod.nama] = p?.totalPenerimaan ?? 0
    }
    return row
  })

  // Harga jual per fase — line chart
  const hargaData = Array.from({ length: inputs.jumlahFase }, (_, fi) => {
    const fase = fi + 1
    const row: Record<string, number | string> = { name: `Fase ${fase}` }
    for (const prod of products) {
      const h = r.hargaJualPerFase.find(x => x.tipeId === prod.id && x.fase === fase)
      row[prod.nama] = h?.hargaTotal ?? 0
    }
    return row
  })

  // Summary per fase
  const faseSummary = Array.from({ length: inputs.jumlahFase }, (_, fi) => {
    const fase = fi + 1
    const totalUnit = products.reduce((s, t) => {
      const p = r.penerimaanPerFase.find(x => x.tipeId === t.id && x.fase === fase)
      return s + (p?.unitTerjual ?? 0)
    }, 0)
    const totalPenerimaan = r.penerimaanPerFase
      .filter(p => p.fase === fase)
      .reduce((s, p) => s + p.totalPenerimaan, 0)
    return { fase, totalUnit, totalPenerimaan }
  })

  return (
    <div className="space-y-6">
      {/* Grouped bar: penerimaan per fase per tipe */}
      <div>
        <h3 className="section-title text-sm">Penerimaan per Fase per Tipe</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={faseData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => formatRupiahAxis(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip formatter={(v: number) => [formatRupiah(v, true)]} />
            <Legend />
            {products.map((t, i) => (
              <Bar key={t.id} dataKey={t.nama} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line chart: harga jual per tipe */}
      {inputs.jumlahFase > 1 && (
        <div className="table-container">
          <h3 className="section-title text-sm">Tren Harga Jual per Tipe (naik per fase)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={hargaData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => formatRupiahAxis(v)} tick={{ fontSize: 10 }} width={90} />
              <Tooltip formatter={(v: number) => [formatRupiah(v, true)]} />
              <Legend />
              {products.map((t, i) => (
                <Line
                  key={t.id}
                  type="monotone"
                  dataKey={t.nama}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabel Harga Jual Per Tipe */}
      <div className="table-container space-y-3">
        <h3 className="section-title text-sm">Tabel Harga Jual per Tipe per Fase</h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-white">
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Tipe</th>
                {Array.from({ length: inputs.jumlahFase }, (_, i) => (
                  <th key={i} className="px-4 py-3 text-right text-xs uppercase tracking-wider">Fase {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((prod, ti) => (
                <tr key={prod.id} className={ti % 2 === 0 ? '' : 'bg-muted/20'}>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">{prod.nama}</td>
                  {Array.from({ length: inputs.jumlahFase }, (_, fi) => {
                    const fase = fi + 1
                    const h = r.hargaJualPerFase.find(x => x.tipeId === prod.id && x.fase === fase)
                    return (
                      <td key={fi} className="px-4 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                        {h && h.hargaTotal > 0 ? formatRupiah(h.hargaTotal, true) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary table */}
      <div className="table-container">
        <h3 className="section-title text-sm">Tabel Penerimaan per Fase</h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-white">
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider">Tipe</th>
                {Array.from({ length: inputs.jumlahFase }, (_, i) => (
                  <th key={i} className="px-4 py-3 text-right text-xs uppercase tracking-wider">Fase {i + 1}</th>
                ))}
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((prod, ti) => {
                const total = r.penerimaanPerFase
                  .filter(p => p.tipeId === prod.id)
                  .reduce((s, p) => s + p.totalPenerimaan, 0)
                return (
                  <tr key={prod.id} className={ti % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="px-4 py-2.5 font-medium">{prod.nama}</td>
                    {Array.from({ length: inputs.jumlahFase }, (_, fi) => {
                      const fase = fi + 1
                      const p = r.penerimaanPerFase.find(x => x.tipeId === prod.id && x.fase === fase)
                      return (
                        <td key={fi} className="px-4 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                          {p && p.totalPenerimaan > 0 ? (
                            <div>
                              <div>{formatRupiah(p.totalPenerimaan, true)}</div>
                              <div className="text-xs text-muted-foreground whitespace-normal">{p.unitTerjual} unit</div>
                            </div>
                          ) : '—'}
                        </td>
                      )
                    })}
                    <td className="px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap">
                      {formatRupiah(total, true)}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-navy/5 font-bold border-t-2 border-navy/20">
                <td className="px-4 py-3 text-navy dark:text-gold whitespace-nowrap">TOTAL</td>
                {faseSummary.map(fs => (
                  <td key={fs.fase} className="px-4 py-3 text-right font-mono whitespace-nowrap">
                    <div>{formatRupiah(fs.totalPenerimaan, true)}</div>
                    <div className="text-xs font-normal text-muted-foreground whitespace-normal">{fs.totalUnit} unit</div>
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-mono text-navy dark:text-gold whitespace-nowrap">
                  {formatRupiah(r.grossRevenue, true)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
