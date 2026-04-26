import { useState } from 'react'
import { PackageOpen, Loader2, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import { predictMaterialSchedule } from '@/lib/ai-material'
import { useToast } from '@/hooks/use-toast'

export default function TabMaterialSchedule() {
  const { activePlan, materialSchedule, setMaterialSchedule, isGeneratingMaterial, setGeneratingMaterial } = useCostStore()
  const { toast } = useToast()
  const [search, setSearch] = useState('')

  const handleGenerate = async () => {
    if (!activePlan) return
    setGeneratingMaterial(true)
    try {
      const items = await predictMaterialSchedule(activePlan.components)
      setMaterialSchedule(items)
      toast({ title: 'Material Schedule berhasil digenerate!', description: `Ditemukan ${items.length} jenis material.` })
    } catch (err: any) {
      toast({ title: 'Gagal generate Material Schedule', description: err.message, variant: 'destructive' })
    } finally {
      setGeneratingMaterial(false)
    }
  }

  const filtered = materialSchedule.filter(m =>
    m.materialName.toLowerCase().includes(search.toLowerCase())
  )

  const grandTotal = materialSchedule.reduce((s, m) => s + m.estimatedTotalCost, 0)

  if (materialSchedule.length === 0) {
    return (
      <div className="py-20 text-center space-y-4">
        <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto">
          <PackageOpen className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold font-serif">Material Schedule AI</h3>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          AI akan bertindak sebagai <strong>Quantity Surveyor (QS)</strong> dan mengkonversi setiap item RAB pekerjaan
          menjadi daftar rinci kebutuhan material (BOM) lengkap dengan estimasi volume dan biaya pengadaan.
        </p>
        <Button
          className="mt-2 bg-navy hover:bg-navy/90 gap-2"
          onClick={handleGenerate}
          disabled={isGeneratingMaterial}
        >
          {isGeneratingMaterial
            ? <><Loader2 className="w-4 h-4 animate-spin" /> AI sedang menghitung material...</>
            : <><PackageOpen className="w-4 h-4" /> Generate Material Schedule</>
          }
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-navy">Material Schedule</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {materialSchedule.length} jenis material • Estimasi Kebutuhan Total:{' '}
            <span className="font-semibold text-navy">Rp {grandTotal.toLocaleString('id-ID')}</span>
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleGenerate} disabled={isGeneratingMaterial}>
          {isGeneratingMaterial
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            : <><RefreshCw className="w-4 h-4" /> Regenerate</>
          }
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari material..."
          className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy/30"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted text-muted-foreground font-medium">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Nama Material</th>
              <th className="px-4 py-3 text-right">Estimasi Volume</th>
              <th className="px-4 py-3">Satuan</th>
              <th className="px-4 py-3 text-right">Harga Satuan</th>
              <th className="px-4 py-3 text-right">Total Estimasi</th>
              <th className="px-4 py-3">Pekerjaan Terkait</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((item, idx) => (
              <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-3 font-semibold text-foreground">{item.materialName}</td>
                <td className="px-4 py-3 text-right">{item.estimatedVolume.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                <td className="px-4 py-3 text-right">Rp {item.estimatedUnitPrice.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-right font-bold text-navy">
                  Rp {item.estimatedTotalCost.toLocaleString('id-ID')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {item.linkedTasks.slice(0, 2).map((task, i) => (
                      <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                        {task.length > 30 ? task.slice(0, 30) + '…' : task}
                      </span>
                    ))}
                    {item.linkedTasks.length > 2 && (
                      <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                        +{item.linkedTasks.length - 2}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted font-bold">
            <tr>
              <td colSpan={5} className="px-4 py-3 text-right">Total Estimasi Kebutuhan Material</td>
              <td className="px-4 py-3 text-right text-navy">Rp {grandTotal.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
