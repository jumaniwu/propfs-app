import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { formatRupiah, formatRupiahAxis, formatPct, CHART_COLORS } from '@/engine/formatter'
import type { FSResults, FSInputs } from '@/types/fs.types'

interface Props {
  results: FSResults
  inputs: FSInputs
}

export default function TabStrukturBiaya({ results: r, inputs }: Props) {
  const costBreakdown = [
    { name: 'Biaya Persiapan', value: r.totalBiayaPersiapan, color: '#0D47A1' },
    { name: 'Biaya Operasional', value: r.totalBiayaOperasional, color: '#C9A84C' },
    { name: 'Biaya Bangunan', value: r.totalBiayaBangun, color: '#1B5E20' },
    { name: 'PPh & Fee', value: r.pphFinal + r.feeMarketing + r.bonusTutupTahun, color: '#B71C1C' },
    { name: 'CSR & Lain', value: r.csr + r.totalRiba, color: '#6A1B9A' },
  ].filter(d => d.value > 0)

  // Flatten products so Apartments are split by unit
  const products = inputs.tipeBangunan.flatMap(t => {
    if (t.kategori === 'apartemen' && t.tipeUnit) {
      return t.tipeUnit.map(u => ({ id: u.id, nama: `${t.nama} - ${u.nama}`, parentId: t.id }))
    }
    return [{ id: t.id, nama: t.nama, parentId: t.id }]
  })

  // Biaya per tipe
  const biayaPerTipe = products.map((prod, i) => {
    const biayaFases = r.biayaBangunPerFase.filter(b => b.tipeId === prod.id)
    const avgBiaya = biayaFases.length > 0
      ? biayaFases.reduce((s, b) => s + b.biayaPerUnit, 0) / biayaFases.length
      : 0

    const hargaFases = r.hargaJualPerFase.filter(h => h.tipeId === prod.id)
    const avgHarga   = hargaFases.length > 0
      ? hargaFases.reduce((s, h) => s + h.hargaTotal, 0) / hargaFases.length
      : 0

    return {
      name: prod.nama,
      'Biaya Bangun': Math.round(avgBiaya),
      'Harga Jual': Math.round(avgHarga),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  })

  // === Rincian Biaya Persiapan ===
  const bp = inputs.biayaPersiapan
  const luasEfektifBruto = (inputs.lahan?.luasLahanTotal || 0) * ((inputs.lahan?.pctLahanEfektif || 0) / 100)
  const luasLahanDisimpan = inputs.lahan?.luasLahanDisimpan || 0
  const luasLahanTotal = inputs.lahan?.luasLahanTotal || 0
  const luasEfektif = Math.max(0, luasEfektifBruto - luasLahanDisimpan)
  const luasInfrastruktur = luasLahanTotal - luasEfektifBruto

  const lHargaLahan = bp.gunakanPerM2 && bp.hargaBeliLahanPerM2 && luasLahanTotal > 0 ? bp.hargaBeliLahanPerM2 * luasLahanTotal : bp.hargaBeliLahan || 0
  const lPerizinan = bp.gunakanPerizinanPerM2 && bp.biayaPerizinanPerM2 && luasLahanTotal > 0 ? bp.biayaPerizinanPerM2 * luasLahanTotal : bp.biayaPerizinan || 0
  const lPengolahan = bp.gunakanPengolahanPerM2 && bp.biayaPengolahanPerM2 && luasLahanTotal > 0 ? bp.biayaPengolahanPerM2 * luasLahanTotal : bp.biayaPengolahanLahan || 0
  const lSarpras = bp.gunakanSarprasPerM2 && bp.biayaSarprasPerM2 ? (luasInfrastruktur > 0 ? bp.biayaSarprasPerM2 * luasInfrastruktur : 0) : bp.biayaSaranadanPrasarana || 0
  const lInventaris = bp.gunakanInventarisPerM2 && bp.biayaInventarisPerM2 && luasLahanTotal > 0 ? bp.biayaInventarisPerM2 * luasLahanTotal : bp.biayaInventarisProyek || 0

  const rincianPersiapan = [
    { name: 'Harga Beli Lahan', value: lHargaLahan },
    { name: 'Biaya Perizinan', value: lPerizinan },
    { name: 'Biaya Pengolahan Lahan', value: lPengolahan },
    { name: 'Biaya Sarana dan Prasarana', value: lSarpras },
    { name: 'Biaya Inventaris Proyek', value: lInventaris }
  ].filter(d => d.value > 0)

  // === Rincian Biaya Operasional ===
  const bo = inputs.biayaOperasional
  const totalMonths = (inputs.durasiPerFase || 0) * (inputs.jumlahFase || 0)

  let lMarketingTotal = 0
  if (bo.biayaMarketingMode === 'per_bulan') lMarketingTotal = (bo.biayaMarketingPerBulan || 0) * totalMonths
  else if (bo.biayaMarketingMode === 'lumpsum_periode') lMarketingTotal = bo.biayaMarketingLumpsum || 0
  else if (bo.biayaMarketingMode === 'detail_item') lMarketingTotal = Object.values(bo.biayaMarketingDetail || {}).reduce((s,v) => s + (Number(v)||0), 0)

  let lKantorTotal = 0
  if (bo.biayaUmumMode === 'per_bulan') lKantorTotal = (bo.biayaUmumKantorPerBulan || 0) * totalMonths
  else if (bo.biayaUmumMode === 'lumpsum_periode') lKantorTotal = bo.biayaUmumLumpsum || 0
  else if (bo.biayaUmumMode === 'detail_item') {
    const totalGajiBulan = Object.values((bo.biayaUmumDetail || {}).gaji || {}).reduce((sum, item) => {
      if (typeof item === 'object' && item !== null) return sum + (item.org * item.gaji)
      return sum + (Number(item) || 0)
    }, 0)
    const d = bo.biayaUmumDetail || {}
    const totalUmumBulan = totalGajiBulan + (d.atk||0) + (d.konsumsi||0) + (d.akomodasi||0) + (d.transportasi||0) + (d.komunikasi||0) + (d.biayaLainLain||0)
    lKantorTotal = totalUmumBulan * totalMonths
  }

  const rincianOperasional = [
    { name: 'Biaya Marketing', value: lMarketingTotal },
    { name: 'Biaya Umum', value: lKantorTotal }
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut chart */}
        <div>
          <h3 className="section-title text-sm">Komposisi Biaya</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={costBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
              >
                {costBreakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [formatRupiah(v, true)]} />
              <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cost table */}
        <div>
          <h3 className="section-title text-sm">Detail Biaya</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider">Komponen</th>
                  <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wider">Nilai</th>
                  <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wider">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costBreakdown.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="px-4 py-2.5 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: row.color }} />
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {formatRupiah(row.value, true)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                      {formatPct(row.value / r.totalInvestment * 100)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-navy/5 font-bold">
                  <td className="px-4 py-2.5">Total Investment</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatRupiah(r.totalInvestment, true)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rincian Persiapan */}
        <div className="table-container">
          <h3 className="section-title text-sm">Rincian Lahan & Persiapan</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider">Komponen</th>
                  <th className="px-3 py-2.5 text-right text-xs uppercase tracking-wider">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rincianPersiapan.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="px-3 py-2.5">{row.name}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{formatRupiah(row.value, true)}</td>
                  </tr>
                ))}
                {rincianPersiapan.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground italic">Tidak ada rincian</td></tr>
                )}
                {rincianPersiapan.length > 0 && (
                  <tr className="bg-navy/5 font-bold">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{formatRupiah(r.totalBiayaPersiapan, true)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rincian Operasional */}
        <div className="table-container">
          <h3 className="section-title text-sm">Rincian Operasional</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-3 py-2.5 text-left text-xs uppercase tracking-wider">Komponen</th>
                  <th className="px-3 py-2.5 text-right text-xs uppercase tracking-wider">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rincianOperasional.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="px-3 py-2.5">{row.name}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{formatRupiah(row.value, true)}</td>
                  </tr>
                ))}
                {rincianOperasional.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground italic">Tidak ada rincian</td></tr>
                )}
                {rincianOperasional.length > 0 && (
                  <tr className="bg-navy/5 font-bold">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{formatRupiah(r.totalBiayaOperasional, true)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* HPP vs Harga Jual per tipe */}
      {biayaPerTipe.length > 0 && (
        <div>
          <h3 className="section-title text-sm">HPP vs Harga Jual per Tipe (Rata-rata/unit)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={biayaPerTipe} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => formatRupiahAxis(v)} tick={{ fontSize: 10 }} width={90} />
              <Tooltip formatter={(v: number) => [formatRupiah(v, true)]} />
              <Legend />
              <Bar dataKey="Biaya Bangun" fill="#B71C1C" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Harga Jual" fill="#1B5E20" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
