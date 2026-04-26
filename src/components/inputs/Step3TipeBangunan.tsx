import { useMemo } from 'react'
import { Plus, Trash2, Building2, Home } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CHART_COLORS } from '@/engine/formatter'
import type { FSInputs, TipeBangunan, TipeUnitApartemen } from '@/types/fs.types'
import { DEFAULT_TIPE, DEFAULT_APARTEMEN } from '@/types/fs.types'
import RupiahInput from '@/components/shared/RupiahInput'

interface Props {
  inputs: FSInputs
  onChange: (partial: Partial<FSInputs>) => void
}

const NumInput = ({ value, placeholder, suffix, onUpdate }: { value: number, placeholder?: string, suffix?: string, onUpdate: (val: number) => void }) => (
  <div className="relative">
    <input type="number" value={value || ''} onChange={e => onUpdate(parseFloat(e.target.value) || 0)} placeholder={placeholder} min={0} className="w-full h-8 rounded-md border border-input bg-background px-2 pr-8 text-sm font-mono focus:ring-2 focus:ring-green-400 focus:border-green-400 focus:outline-none" />
    {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">{suffix}</span>}
  </div>
)

export default function Step3TipeBangunan({ inputs, onChange }: Props) {
  const tipes = inputs.tipeBangunan
  const landedTipes = tipes.filter(t => t.kategori !== 'apartemen')
  const aptTipes    = tipes.filter(t => t.kategori === 'apartemen')

  // Helper untuk mendapatkan total unit dari Apartemen
  const getUnitApartemen = (t: TipeBangunan) => (t.tipeUnit || []).reduce((s, u) => s + u.jumlahUnit, 0)
  
  const totalUnit = useMemo(() => tipes.reduce((s, t) => s + (t.kategori === 'apartemen' ? getUnitApartemen(t) : t.jumlahUnit), 0), [tipes])
  const totalLuasKavlingLanded = useMemo(() => landedTipes.reduce((s, t) => s + t.luasKavling * t.jumlahUnit, 0), [landedTipes])
  const totalLuasLahanApartemen = useMemo(() => aptTipes.reduce((s, t) => s + (t.luasLahanTower || 0), 0), [aptTipes])
  const totalLahanTerpakai = totalLuasKavlingLanded + totalLuasLahanApartemen
  
  const luasLahanDisimpan = inputs.lahan.luasLahanDisimpan || 0
  const luasEfektifBruto = inputs.lahan.luasLahanTotal * (inputs.lahan.pctLahanEfektif / 100)
  const luasEfektif = Math.max(0, luasEfektifBruto - luasLahanDisimpan)
  const overCapacity = luasEfektif > 0 && totalLahanTerpakai > luasEfektif

  const pieData = tipes.map((t, i) => ({
    name:  t.nama || `Tipe ${i + 1}`,
    value: t.kategori === 'apartemen' ? getUnitApartemen(t) : t.jumlahUnit,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  function addLanded() {
    onChange({ tipeBangunan: [...tipes, { ...DEFAULT_TIPE, id: uuidv4(), nama: `Landed ${landedTipes.length + 1}` }] })
  }

  function addApartemen() {
    onChange({ tipeBangunan: [...tipes, { ...DEFAULT_APARTEMEN, id: uuidv4(), nama: `Tower ${aptTipes.length + 1}` }] })
  }

  function removeTipe(id: string) {
    onChange({ tipeBangunan: tipes.filter(t => t.id !== id) })
  }

  function updateTipe(id: string, field: keyof TipeBangunan, value: any) {
    onChange({ tipeBangunan: tipes.map(t => t.id === id ? { ...t, [field]: value } : t) })
  }
  
  function addUnitApt(towerId: string) {
    const t = tipes.find(x => x.id === towerId)
    if (!t) return
    const newUnit: TipeUnitApartemen = { id: uuidv4(), nama: 'Studio', luasUnit: 24, jumlahUnit: 10, marginUnitPerM2: 0, kelipatanMarginUnit: 1 }
    updateTipe(towerId, 'tipeUnit', [...(t.tipeUnit || []), newUnit])
  }
  
  function updateUnitApt(towerId: string, unitId: string, field: keyof TipeUnitApartemen, value: any) {
    const t = tipes.find(x => x.id === towerId)
    if (!t) return
    updateTipe(towerId, 'tipeUnit', (t.tipeUnit || []).map(u => u.id === unitId ? { ...u, [field]: value } : u))
  }
  
  function removeUnitApt(towerId: string, unitId: string) {
    const t = tipes.find(x => x.id === towerId)
    if (!t) return
    updateTipe(towerId, 'tipeUnit', (t.tipeUnit || []).filter(u => u.id !== unitId))
  }

  return (
    <div className="space-y-6">
      {/* Tombol Tambah */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={addLanded} className="gap-2 border-dashed bg-white hover:bg-slate-50">
          <Home className="h-4 w-4" /> Tambah Landed
        </Button>
        <Button variant="outline" size="sm" onClick={addApartemen} className="gap-2 border-dashed bg-white hover:bg-slate-50">
          <Building2 className="h-4 w-4" /> Tambah Tower Apartemen
        </Button>
      </div>

      {/* Tabel Landed */}
      {landedTipes.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Produk Landed (Perumahan / Ruko)</h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-3 py-3 text-left font-medium text-xs uppercase tracking-wider min-w-[140px]">Nama Tipe</th>
                  <th className="px-3 py-3 text-right font-medium text-xs uppercase tracking-wider">LB (m²)</th>
                  <th className="px-3 py-3 text-right font-medium text-xs uppercase tracking-wider">LK (m²)</th>
                  <th className="px-3 py-3 text-right font-medium text-xs uppercase tracking-wider">Unit</th>
                  <th className="px-3 py-3 text-right font-medium text-xs uppercase tracking-wider">Total Kavling</th>
                  <th className="px-1 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {landedTipes.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <td className="px-3 py-2"><input type="text" value={t.nama} onChange={e => updateTipe(t.id, 'nama', e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:ring-green-400 focus:outline-none" /></td>
                    <td className="px-3 py-2"><NumInput value={t.luasBangunan} suffix="m²" onUpdate={v => updateTipe(t.id, 'luasBangunan', v)} /></td>
                    <td className="px-3 py-2"><NumInput value={t.luasKavling} suffix="m²" onUpdate={v => updateTipe(t.id, 'luasKavling', v)} /></td>
                    <td className="px-3 py-2"><NumInput value={t.jumlahUnit} suffix="unit" onUpdate={v => updateTipe(t.id, 'jumlahUnit', v)} /></td>
                    <td className="px-3 py-2 text-right font-mono text-sm">{(t.luasKavling * t.jumlahUnit).toLocaleString('id-ID')} m²</td>
                    <td className="px-1 py-2"><button onClick={() => removeTipe(t.id)} className="p-1.5 text-muted-foreground hover:text-red-500 rounded-md"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apartemen */}
      {aptTipes.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Produk Apartemen (High-Rise)</h3>
          {aptTipes.map((t, index) => (
            <div key={t.id} className="border border-border bg-white rounded-xl overflow-hidden">
              <div className="bg-slate-50 border-b border-border p-4 flex justify-between items-center">
                <input type="text" value={t.nama} onChange={e => updateTipe(t.id, 'nama', e.target.value)} placeholder={`Tower ${index + 1}`} className="bg-transparent font-bold text-lg focus:outline-none focus:ring-b border-b border-transparent focus:border-navy px-1" />
                <Button variant="ghost" size="sm" onClick={() => removeTipe(t.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2"><Trash2 className="h-4 w-4 mr-2" /> Hapus Tower</Button>
              </div>
              <div className="p-4 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Luas Lahan Tower (m²)</Label>
                    <p className="text-[10px] text-muted-foreground mb-1 mt-0.5">Footprint pemakaian lahan efektif</p>
                    <NumInput value={t.luasLahanTower || 0} suffix="m²" onUpdate={v => updateTipe(t.id, 'luasLahanTower', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Luas Lantai Dasar (m²)</Label>
                    <NumInput value={t.luasLantaiDasar || 0} suffix="m²" onUpdate={v => updateTipe(t.id, 'luasLantaiDasar', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Luas Total Podium & Parkiran (m²)</Label>
                    <NumInput value={t.luasPodiumParkiran || 0} suffix="m²" onUpdate={v => updateTipe(t.id, 'luasPodiumParkiran', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Efisiensi Bangunan (%)</Label>
                    <NumInput value={t.efisiensiLantai || 80} suffix="%" onUpdate={v => updateTipe(t.id, 'efisiensiLantai', v)} />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-semibold">Tipe Unit {t.nama}</Label>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addUnitApt(t.id)}><Plus className="h-3 w-3 mr-1" /> Tambah Unit</Button>
                  </div>
                  {(t.tipeUnit || []).length === 0 ? (
                    <div className="text-center p-4 bg-slate-50 text-xs text-muted-foreground border rounded-md">Belum ada tipe unit di tower ini.</div>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="py-2 px-2">Nama Tipe (cth: Studio)</th>
                          <th className="py-2 px-2 text-right">Luas Semi Gross / NSA (m²)</th>
                          <th className="py-2 px-2 text-right">Jumlah Unit</th>
                          <th className="py-2 px-2 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(t.tipeUnit || []).map(u => (
                          <tr key={u.id}>
                            <td className="py-1 px-2"><input type="text" value={u.nama} onChange={e => updateUnitApt(t.id, u.id, 'nama', e.target.value)} className="w-full border rounded px-2 h-7" /></td>
                            <td className="py-1 px-2"><NumInput value={u.luasSemigross} onUpdate={v => updateUnitApt(t.id, u.id, 'luasSemigross', v)} /></td>
                            <td className="py-1 px-2"><NumInput value={u.jumlahUnit} onUpdate={v => updateUnitApt(t.id, u.id, 'jumlahUnit', v)} /></td>
                            <td className="py-1 px-2 text-center"><button onClick={() => removeUnitApt(t.id, u.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="h-3.5 w-3.5" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        {(() => {
                          const tu = t.tipeUnit || []
                          const sumUnit = tu.reduce((s, u) => s + u.jumlahUnit, 0)
                          const sumSGA = tu.reduce((s, u) => s + ((u.luasSemigross || 0) * (u.jumlahUnit || 0)), 0)
                          const gfa = sumSGA / ((t.efisiensiLantai || 80) / 100)
                          return (
                            <tr className="border-t bg-slate-50 font-medium">
                              <td className="py-2 px-2 text-right text-xs">Total Selling Area & GFA:</td>
                              <td className="py-2 px-2 text-right">
                                <span className="font-mono">{sumSGA.toLocaleString("id-ID")} m²</span>
                                <div className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">Est. GFA: {Math.round(gfa).toLocaleString("id-ID")} m²</div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono">{sumUnit} Unit</td>
                              <td></td>
                            </tr>
                          )
                        })()}
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Validasi Lahan */}
      <div className={`p-4 rounded-xl border ${overCapacity ? 'bg-red-50 border-red-200' : 'bg-muted/10 border-border'} flex justify-between items-center`}>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Kapasitas Lahan Efektif</p>
          <div className="flex items-end gap-2">
            <span className={`font-mono font-bold text-lg ${overCapacity ? 'text-red-700' : 'text-foreground'}`}>
              {totalLahanTerpakai.toLocaleString('id-ID')} m²
            </span>
            <span className="text-sm pb-0.5 text-muted-foreground">/ {luasEfektif.toLocaleString('id-ID')} m²</span>
          </div>
        </div>
        {luasEfektif > 0 && (
           <div className={`px-3 py-1 rounded-full text-xs font-semibold ${overCapacity ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
             {((totalLahanTerpakai / luasEfektif) * 100).toFixed(1)}% Terpakai
           </div>
        )}
      </div>

      {/* Pie chart */}
      {pieData.length > 0 && totalUnit > 0 && (
        <div className="bg-muted/10 border border-border rounded-xl p-4">
          <p className="text-sm font-medium mb-3 text-center text-muted-foreground">Distribusi Unit per Tipe</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} paddingAngle={2}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v} unit`]} />
              <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
