import { useState, useMemo } from 'react'
import {
  PackageOpen, Loader2, RefreshCw, Search, Download, AlertTriangle,
  BarChart3, ShoppingCart, Package
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import { predictMaterialSchedule } from '@/lib/ai-material'
import { useToast } from '@/hooks/use-toast'
import { MaterialStatus } from '@/types/cost.types'
import * as xlsx from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts'

type InnerTab = 'kebutuhan' | 'analisa' | 'realisasi'

const STATUS_LABELS: Record<MaterialStatus, { label: string; color: string }> = {
  belum_order:  { label: 'Belum Order',   color: 'bg-slate-100 text-slate-700' },
  sudah_order:  { label: 'Sudah Order',   color: 'bg-blue-100 text-blue-700' },
  sudah_datang: { label: 'Sudah Datang',  color: 'bg-emerald-100 text-emerald-700' },
  terpakai:     { label: 'Terpakai',      color: 'bg-purple-100 text-purple-700' },
}

const PARETO_COLORS = ['#1e3a5f','#2563eb','#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#c9a84c','#f59e0b','#fbbf24','#fcd34d']

export default function TabMaterialSchedule() {
  const { activePlan, materialSchedule, setMaterialSchedule, updateMaterialItem, isGeneratingMaterial, setGeneratingMaterial, realisasiEntries } = useCostStore()
  const { toast } = useToast()
  const [innerTab, setInnerTab] = useState<InnerTab>('kebutuhan')
  const [search, setSearch] = useState('')

  const handleGenerate = async () => {
    if (!activePlan) return
    setGeneratingMaterial(true)
    try {
      const items = await predictMaterialSchedule(activePlan.components)
      setMaterialSchedule(items)
      toast({ title: 'Material Schedule berhasil digenerate!', description: `${items.length} jenis material.` })
    } catch (err: any) {
      toast({ title: 'Gagal generate', description: err.message, variant: 'destructive' })
    } finally {
      setGeneratingMaterial(false)
    }
  }

  const filtered = materialSchedule.filter(m => m.materialName.toLowerCase().includes(search.toLowerCase()))
  const grandTotal = materialSchedule.reduce((s, m) => s + m.estimatedTotalCost, 0)

  // Pareto: top 10 termahal
  const paretoData = useMemo(() =>
    [...materialSchedule]
      .sort((a, b) => b.estimatedTotalCost - a.estimatedTotalCost)
      .slice(0, 10)
      .map(m => ({ name: m.materialName.length > 20 ? m.materialName.slice(0, 20) + '…' : m.materialName, value: m.estimatedTotalCost }))
  , [materialSchedule])

  // Donut: Material vs Upah dari realisasi
  const totalMatRealisasi = realisasiEntries.filter(e => e.tipe === 'material').reduce((s, e) => s + e.jumlah, 0)
  const totalUpahRealisasi = realisasiEntries.filter(e => e.tipe === 'upah').reduce((s, e) => s + e.jumlah, 0)
  const donutData = [
    { name: 'Material', value: totalMatRealisasi, fill: '#1e3a5f' },
    { name: 'Upah', value: totalUpahRealisasi, fill: '#c9a84c' },
  ].filter(d => d.value > 0)

  const exportExcel = () => {
    const wb = xlsx.utils.book_new()
    const kebutuhanData = materialSchedule.map((m, i) => ({
      '#': i + 1, 'Nama Material': m.materialName, 'Vol Estimasi': m.estimatedVolume,
      'Satuan': m.unit, 'Harga Satuan (Rp)': m.estimatedUnitPrice, 'Total Estimasi (Rp)': m.estimatedTotalCost,
      'Status': m.status ? STATUS_LABELS[m.status].label : 'Belum Order',
      'Lead Time (Hari)': m.leadTimeDays ?? '',
      'Pekerjaan Terkait': m.linkedTasks.join(', '),
    }))
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(kebutuhanData), 'Kebutuhan Material')

    const realisasiData = materialSchedule.filter(m => m.actualQty).map(m => ({
      'Nama Material': m.materialName, 'Qty Aktual': m.actualQty, 'Satuan': m.unit,
      'Harga Aktual (Rp)': m.actualUnitPrice, 'Total Aktual (Rp)': m.actualTotalCost,
      'Supplier': m.supplier ?? '', 'Tgl Order': m.orderDate ?? '', 'Tgl Datang': m.arrivalDate ?? '',
      'No. Invoice': m.invoiceNumber ?? '',
      'Deviasi Harga (%)': m.actualUnitPrice && m.estimatedUnitPrice
        ? (((m.actualUnitPrice - m.estimatedUnitPrice) / m.estimatedUnitPrice) * 100).toFixed(1) + '%' : '',
    }))
    if (realisasiData.length > 0) xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(realisasiData), 'Realisasi Pembelian')
    xlsx.writeFile(wb, `Material_Schedule_${new Date().toLocaleDateString('id-ID').replace(/\//g, '')}.xlsx`)
    toast({ title: '✅ Export Excel berhasil!' })
  }

  if (materialSchedule.length === 0) {
    return (
      <div className="py-20 text-center space-y-4">
        <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto">
          <PackageOpen className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold font-serif">Material Schedule AI</h3>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          AI akan bertindak sebagai <strong>Quantity Surveyor (QS)</strong> dan mengkonversi setiap item RAB
          menjadi daftar rinci kebutuhan material (BOM) lengkap dengan estimasi volume dan biaya.
        </p>
        <Button className="mt-2 bg-navy hover:bg-navy/90 gap-2" onClick={handleGenerate} disabled={isGeneratingMaterial}>
          {isGeneratingMaterial
            ? <><Loader2 className="w-4 h-4 animate-spin" /> AI sedang menghitung...</>
            : <><PackageOpen className="w-4 h-4" /> Generate Material Schedule</>
          }
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-serif font-bold text-navy">Material Schedule</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {materialSchedule.length} jenis material · Total Estimasi:{' '}
            <span className="font-semibold text-navy">Rp {grandTotal.toLocaleString('id-ID')}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={exportExcel}>
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleGenerate} disabled={isGeneratingMaterial}>
            {isGeneratingMaterial ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><RefreshCw className="w-4 h-4" /> Regenerate</>}
          </Button>
        </div>
      </div>

      {/* Inner Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
        {([
          { key: 'kebutuhan', label: 'Kebutuhan Material', icon: <Package className="w-4 h-4" /> },
          { key: 'analisa',   label: 'Analisa',            icon: <BarChart3 className="w-4 h-4" /> },
          { key: 'realisasi', label: 'Realisasi Pembelian', icon: <ShoppingCart className="w-4 h-4" /> },
        ] as { key: InnerTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.key} onClick={() => setInnerTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              innerTab === t.key ? 'bg-white shadow-sm text-navy' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Kebutuhan ──────────────────────────────────────────────── */}
      {innerTab === 'kebutuhan' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari material..."
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy/30" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground font-medium text-xs">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Nama Material</th>
                  <th className="px-4 py-3 text-right">Vol</th>
                  <th className="px-4 py-3">Sat</th>
                  <th className="px-4 py-3 text-right">Harga Sat.</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Lead Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Pekerjaan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item, idx) => {
                  const st = item.status ?? 'belum_order'
                  const stInfo = STATUS_LABELS[st]
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold">{item.materialName}</td>
                      <td className="px-4 py-3 text-right">{item.estimatedVolume.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                      <td className="px-4 py-3 text-right">Rp {item.estimatedUnitPrice.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-right font-bold text-navy">Rp {item.estimatedTotalCost.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} value={item.leadTimeDays ?? ''}
                          onChange={e => updateMaterialItem(item.id, { leadTimeDays: Number(e.target.value) })}
                          placeholder="—" className="w-14 text-center text-xs border border-border rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-navy/30" />
                        <span className="text-xs text-muted-foreground ml-1">hari</span>
                      </td>
                      <td className="px-4 py-3">
                        <select value={st}
                          onChange={e => updateMaterialItem(item.id, { status: e.target.value as MaterialStatus })}
                          className={`text-[11px] font-bold px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${stInfo.color}`}>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.linkedTasks.slice(0, 2).map((t, i) => (
                            <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                              {t.length > 25 ? t.slice(0, 25) + '…' : t}
                            </span>
                          ))}
                          {item.linkedTasks.length > 2 && (
                            <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">+{item.linkedTasks.length - 2}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-muted font-bold">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right">Total Estimasi</td>
                  <td className="px-4 py-3 text-right text-navy">Rp {grandTotal.toLocaleString('id-ID')}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* ── TAB: Analisa ────────────────────────────────────────────────── */}
      {innerTab === 'analisa' && (
        <div className="space-y-6">
          {/* Pareto */}
          <div className="bg-white border border-border rounded-2xl p-5">
            <h4 className="font-bold text-navy mb-1">Top 10 Material Termahal (Pareto)</h4>
            <p className="text-xs text-muted-foreground mb-4">Material yang menyumbang biaya terbesar dari total RAB</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={paretoData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={v => `Rp ${(v/1_000_000).toFixed(0)}Jt`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                <Tooltip formatter={(v: any) => [`Rp ${Number(v).toLocaleString('id-ID')}`, 'Estimasi Biaya']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {paretoData.map((_, i) => <Cell key={i} fill={PARETO_COLORS[i % PARETO_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Donut */}
          {donutData.length > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5">
              <h4 className="font-bold text-navy mb-1">Distribusi Biaya Realisasi</h4>
              <p className="text-xs text-muted-foreground mb-4">Material vs Upah berdasarkan data Realisasi Biaya yang sudah dicatat</p>
              <div className="flex items-center justify-center gap-8">
                <ResponsiveContainer width={220} height={220}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value">
                      {donutData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Legend />
                    <Tooltip formatter={(v: any) => [`Rp ${Number(v).toLocaleString('id-ID')}`, '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: d.fill }} />
                      <div>
                        <p className="text-sm font-semibold">{d.name}</p>
                        <p className="text-xs text-muted-foreground">Rp {d.value.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bulk Purchase Recommendation */}
          {(() => {
            const bulkCandidates = materialSchedule.filter(m => m.estimatedTotalCost > grandTotal * 0.05)
            if (bulkCandidates.length === 0) return null
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h4 className="font-bold text-amber-800 mb-1 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Rekomendasi Bulk Purchase
                </h4>
                <p className="text-xs text-amber-700 mb-3">Material berikut menyumbang &gt;5% dari total anggaran — pertimbangkan pengadaan bulk untuk efisiensi biaya:</p>
                <div className="space-y-2">
                  {bulkCandidates.map(m => (
                    <div key={m.id} className="flex justify-between items-center bg-white rounded-xl px-3 py-2 text-sm">
                      <span className="font-medium">{m.materialName}</span>
                      <span className="font-bold text-amber-700">Rp {m.estimatedTotalCost.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── TAB: Realisasi Pembelian ─────────────────────────────────────── */}
      {innerTab === 'realisasi' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Input realisasi pembelian material aktual. Alert merah jika harga aktual melebihi estimasi RAB lebih dari 10%.</p>
          <div className="space-y-3">
            {materialSchedule.map(item => {
              const deviasi = item.actualUnitPrice && item.estimatedUnitPrice
                ? ((item.actualUnitPrice - item.estimatedUnitPrice) / item.estimatedUnitPrice) * 100 : null
              const isOver = deviasi !== null && deviasi > 10

              return (
                <div key={item.id} className={`bg-white border rounded-2xl p-4 shadow-sm ${isOver ? 'border-red-300 bg-red-50/30' : 'border-border'}`}>
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div>
                      <p className="font-semibold text-sm text-navy">{item.materialName}</p>
                      <p className="text-xs text-muted-foreground">Estimasi: {item.estimatedVolume} {item.unit} @ Rp {item.estimatedUnitPrice.toLocaleString('id-ID')}</p>
                    </div>
                    {deviasi !== null && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${isOver ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isOver ? '⚠️ ' : '✅ '}{deviasi >= 0 ? '+' : ''}{deviasi.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Qty Aktual', field: 'actualQty', type: 'number', value: item.actualQty ?? '' },
                      { label: 'Harga Aktual (Rp/sat)', field: 'actualUnitPrice', type: 'number', value: item.actualUnitPrice ?? '' },
                      { label: 'Supplier', field: 'supplier', type: 'text', value: item.supplier ?? '' },
                      { label: 'Tgl Order', field: 'orderDate', type: 'date', value: item.orderDate ?? '' },
                      { label: 'Tgl Datang', field: 'arrivalDate', type: 'date', value: item.arrivalDate ?? '' },
                      { label: 'No. Invoice', field: 'invoiceNumber', type: 'text', value: item.invoiceNumber ?? '' },
                    ].map(f => (
                      <div key={f.field}>
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{f.label}</label>
                        <input type={f.type} value={f.value}
                          onChange={e => {
                            const val = f.type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value
                            const patch: any = { [f.field]: val }
                            if (f.field === 'actualQty' || f.field === 'actualUnitPrice') {
                              const qty = f.field === 'actualQty' ? Number(e.target.value) : (item.actualQty ?? 0)
                              const price = f.field === 'actualUnitPrice' ? Number(e.target.value) : (item.actualUnitPrice ?? 0)
                              patch.actualTotalCost = qty * price
                            }
                            updateMaterialItem(item.id, patch)
                          }}
                          className="w-full mt-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30 bg-white"
                        />
                      </div>
                    ))}
                  </div>
                  {item.actualTotalCost !== undefined && item.actualTotalCost > 0 && (
                    <p className="text-xs font-bold text-navy mt-2">Total Aktual: Rp {item.actualTotalCost.toLocaleString('id-ID')}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
