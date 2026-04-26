import { useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sparkles, Activity } from 'lucide-react'
import RupiahInput from '@/components/shared/RupiahInput'
import { formatRupiah } from '@/engine/formatter'
import {
  calcBiayaPersiapan,
  calcBiayaOperasional,
  calcBiayaPersiapanPerM2,
  calcBiayaOpsPerM2,
  calcHargaJualBangunan,
  calcHargaJualKavling,
  getSellingEntities,
  calculateFS
} from '@/engine/calculator'
import type { FSInputs } from '@/types/fs.types'

import { useAuthStore } from '@/store/authStore'

interface Props {
  inputs: FSInputs
  onChange: (partial: Partial<FSInputs>) => void
}

export default function Step5HargaJual({ inputs, onChange }: Props) {
  const { isFeatureEnabled } = useAuthStore()
  const isAIEnabled = isFeatureEnabled('ai_solver')
  const [showAI, setShowAI] = useState(false)
  
  const entities = useMemo(() => getSellingEntities(inputs), [inputs.tipeBangunan])
  
  const totalBP  = useMemo(() => calcBiayaPersiapan(inputs), [inputs])
  const totalBO  = useMemo(() => calcBiayaOperasional(inputs), [inputs])
  const bpPerM2  = useMemo(() => calcBiayaPersiapanPerM2(entities, totalBP), [entities, totalBP])
  const boPerM2  = useMemo(() => calcBiayaOpsPerM2(entities, totalBO), [entities, totalBO])

  const tipes = inputs.tipeBangunan

  const updateLanded = (tipeId: string, field: string, value: number) => {
    onChange({
      tipeBangunan: tipes.map(t => t.id === tipeId ? { ...t, [field]: value } : t)
    })
  }

  const updateUnitApt = (towerId: string, unitId: string, field: string, value: number) => {
    onChange({
      tipeBangunan: tipes.map(t => {
        if (t.id === towerId && t.tipeUnit) {
          return {
            ...t,
            tipeUnit: t.tipeUnit.map(u => u.id === unitId ? { ...u, [field]: value } : u)
          }
        }
        return t
      })
    })
  }

  // Pisahkan tipe
  const landedTipes = tipes.filter(t => t.kategori !== 'apartemen')
  const aptTipes = tipes.filter(t => t.kategori === 'apartemen')

  return (
    <div className="space-y-6">
      {/* Header & AI Button */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between pb-2 border-b border-border">
        <div>
          <h3 className="text-lg font-bold">Harga Jual & Margin Keuntungan</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Setting target profit untuk setiap tipe bangunan dan fasilitasnya.
          </p>
        </div>
        {isAIEnabled && (
          <Button 
            onClick={() => setShowAI(true)}
            className="gap-2 bg-gradient-to-br from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white shadow-md rounded-full px-6"
          >
            <Sparkles className="h-4 w-4" />
            ✨ AI Target Profit Solver
          </Button>
        )}
      </div>
      
      {/* Per-m² helpers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard label="Total Biaya Persiapan" value={formatRupiah(totalBP, true)} sub="dari Step 4" />
        <InfoCard label="Total Biaya Operasional" value={formatRupiah(totalBO, true)} sub="dari Step 4" />
        <InfoCard label="Biaya Persiapan / m² Kavling" value={formatRupiah(bpPerM2, true)} sub="landed only" />
        <InfoCard label="Biaya Operasional / m² Kavling" value={formatRupiah(boPerM2, true)} sub="landed only" />
      </div>

      {tipes.length === 0 && (
        <div className="py-8 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border mt-4">
          Tambahkan Tipe Bangunan Landed atau Apartemen di Step 3 terlebih dahulu.
        </div>
      )}

      {/* Render Landed Tipes */}
      {landedTipes.map((tipe, i) => {
        const ent = entities.find(e => e.id === tipe.id)
        if(!ent) return null
        
        const hargaBangunF1 = calcHargaJualBangunan(ent, 1)
        const hargaKavling  = calcHargaJualKavling(ent, bpPerM2, boPerM2)
        const hargaTotal    = hargaBangunF1 + hargaKavling

        return (
          <div key={tipe.id} className="border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-navy px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-white text-sm">{tipe.nama || `Landed ${i + 1}`}</span>
              <span className="text-gold text-xs">LB: {tipe.luasBangunan}m² | LK: {tipe.luasKavling}m²</span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
              {/* Bangunan */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs">A</div> 
                  Harga Jual Bangunan
                </h4>
                <div className="space-y-2.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <Label className="text-xs shrink-0">HPP Konstruksi / m²</Label>
                    <span className="font-mono text-xs font-semibold text-slate-700">
                      {formatRupiah(ent.biayaPokokPerM2, true)}
                    </span>
                  </div>
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">Margin Profit / m² (Rp)</Label>
                    <RupiahInput value={tipe.marginBangunanPerM2} onChange={v => updateLanded(tipe.id, 'marginBangunanPerM2', v)} />
                  </div>
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">% Kenaikan Harga / Fase</Label>
                    <input type="number" value={tipe.kelipatanMarginBangunan} onChange={e => updateLanded(tipe.id, 'kelipatanMarginBangunan', parseFloat(e.target.value) || 0)} min={0} step={1} className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm font-mono focus:ring-2 focus:ring-navy focus:outline-none" placeholder="5" />
                  </div>
                  <div className="bg-blue-600 rounded-lg p-2.5 text-center mt-3 shadow-inner">
                    <div className="text-xs text-blue-100 uppercase tracking-wider font-medium mb-1">Harga Bangunan Total (Fase 1)</div>
                    <div className="font-mono font-bold text-white text-base break-words">
                      {formatRupiah(hargaBangunF1, true)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Kavling */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 text-xs">B</div> 
                  Harga Jual Kavling
                </h4>
                <div className="space-y-2.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs shrink-0 text-muted-foreground">Beban Persiapan / m²</Label>
                    <span className="font-mono text-xs">{formatRupiah(bpPerM2, true)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <Label className="text-xs shrink-0 text-muted-foreground">Beban Operasional / m²</Label>
                    <span className="font-mono text-xs">{formatRupiah(boPerM2, true)}</span>
                  </div>
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">Margin Kavling / m² (Rp)</Label>
                    <RupiahInput value={tipe.marginKavlingPerM2} onChange={v => updateLanded(tipe.id, 'marginKavlingPerM2', v)} />
                  </div>
                  <div className="bg-orange-100 dark:bg-orange-950/50 rounded-lg p-2.5 text-center mt-4 border border-orange-200 dark:border-orange-800 shadow-sm" style={{marginTop: '4.2rem'}}>
                    <div className="text-xs text-orange-800 dark:text-orange-200 uppercase tracking-wider font-semibold mb-1">Harga Kavling Total (Flat)</div>
                    <div className="font-mono font-bold text-orange-900 dark:text-orange-100 text-base break-words">
                      {formatRupiah(hargaKavling, true)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Landed */}
            <div className="bg-navy/5 px-4 py-3 flex items-center justify-between border-t border-border">
              <span className="text-sm font-semibold pr-2">Total Harga Jual 1 Unit Landed (Fase 1)</span>
              <span className="font-mono font-bold text-navy text-lg sm:text-xl break-words text-right">
                {formatRupiah(hargaTotal, true)}
              </span>
            </div>
          </div>
        )
      })}
      
      {/* Render Apartemen Towers */}
      {aptTipes.map((tower, i) => {
        const unitsInside = tower.tipeUnit || []
        
        return (
          <div key={tower.id} className="border border-indigo-200 rounded-xl overflow-hidden shadow-sm mt-6">
            <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-white text-sm">{tower.nama || `Tower ${i + 1}`} (Apartemen)</span>
              <span className="text-indigo-200 text-xs">{unitsInside.reduce((s,u)=>s+u.jumlahUnit,0)} Unit Terdaftar</span>
            </div>
            
            <div className="p-4 bg-white">
              {unitsInside.length === 0 ? (
                <div className="text-sm text-center text-muted-foreground p-4 bg-slate-50 rounded-lg">Silakan tambahkan Tipe Unit Apartemen di Step 3 untuk Tower ini.</div>
              ) : (
                <div className="space-y-6">
                  {unitsInside.map(unit => {
                    const ent = entities.find(e => e.id === unit.id)!
                    const hargaJualUnitF1 = calcHargaJualBangunan(ent, 1) // apartemen no kavling, just bangunan logic

                    return (
                      <div key={unit.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                        <div className="flex justify-between items-center mb-3">
                          <h5 className="font-bold text-indigo-900">{unit.nama} <span className="font-normal text-xs text-slate-500 ml-2">({unit.luasSemigross} m² NSA)</span></h5>
                          <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded font-semibold">{unit.jumlahUnit} Unit</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Prorata HPP Bangunan / m²</Label>
                            <div className="font-mono text-sm font-semibold h-9 flex items-center bg-white px-3 rounded border border-slate-200">
                              {formatRupiah(ent.biayaPokokPerM2, true)}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 leading-tight">Meliputi HPP Tower & Podium terdistribusi</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-indigo-700 font-semibold">Target Margin / m² (Rp)</Label>
                            <RupiahInput value={unit.marginUnitPerM2} onChange={v => updateUnitApt(tower.id, unit.id, 'marginUnitPerM2', v)} />
                          </div>
                          <div className="space-y-1 w-full max-w-full overflow-hidden">
                            <Label className="text-xs font-semibold text-emerald-700">Estimasi Harga Jual (Fase 1)</Label>
                            <div className="bg-emerald-500 text-white font-mono font-bold flex flex-wrap items-center px-3 py-1.5 min-h-[36px] rounded border border-emerald-600 shadow-inner justify-end text-right break-words text-sm sm:text-base cursor-default" title={formatRupiah(hargaJualUnitF1, true)}>
                              {formatRupiah(hargaJualUnitF1, true)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}
      
      {/* AI Solver Trigger Modal */}
      {showAI && (
        <AISolverModal inputs={inputs} onChange={onChange} onClose={() => setShowAI(false)} />
      )}
    </div>
  )
}

function AISolverModal({ inputs, onChange, onClose }: { inputs: FSInputs, onChange: (partial: Partial<FSInputs>) => void, onClose: () => void }) {
  const [targetMargin, setTargetMargin] = useState<number>(20) // default 20%
  const [selectedTargets, setSelectedTargets] = useState<string[]>(inputs.tipeBangunan.map(t => t.id))
  const [isSolving, setIsSolving] = useState(false)
  const [resultMsg, setResultMsg] = useState('')
  const [proposedInputs, setProposedInputs] = useState<FSInputs | null>(null)

  const handleSolve = () => {
    setIsSolving(true)
    setResultMsg('AI Autoflight sedang menghitung...')
    
    setTimeout(() => {
      // Binary search algorithm for scalar X
      let low = -100 // bisa mengurangi margin
      let high = 500 // max 500x lipat
      let bestX = 1
      let bestInputs: FSInputs = inputs
      
      const MAX_ITER = 50
      const TOLERANCE = 0.1 // 0.1% diff
      
      for(let i=0; i<MAX_ITER; i++) {
        let mid = (low + high) / 2
        
        // Clone and apply mid multiplier against a baseline (using base margin 1000000 if currently 0)
        let clone: FSInputs = JSON.parse(JSON.stringify(inputs))
        clone.tipeBangunan = clone.tipeBangunan.map(t => {
          let nt = { ...t }
          if (selectedTargets.includes(nt.id)) {
            if (nt.kategori === 'apartemen' && nt.tipeUnit) {
              nt.tipeUnit = nt.tipeUnit.map(u => ({
                ...u,
                marginUnitPerM2: (u.marginUnitPerM2 || 1000000) * (mid < 0 ? 0.01 : Math.max(0.1, mid))
              }))
            } else {
              nt.marginBangunanPerM2 = (nt.marginBangunanPerM2 || 1000000) * (mid < 0 ? 0.01 : Math.max(0.1, mid))
              nt.marginKavlingPerM2 = (nt.marginKavlingPerM2 || 500000) * (mid < 0 ? 0.01 : Math.max(0.1, mid))
            }
          }
          return nt
        })
        
        const output = calculateFS(clone)
        
        if (Math.abs(output.netMargin - targetMargin) <= TOLERANCE) {
          bestX = mid
          bestInputs = clone
          break
        }
        
        if (output.netMargin < targetMargin) {
          low = mid
        } else {
          high = mid
        }
        bestX = mid
        bestInputs = clone
      }
      
      const finalRes = calculateFS(bestInputs)
      setProposedInputs(bestInputs)
      setResultMsg(`Solver berhasil menemukan konfigurasi! Skalar Multiplier: ${bestX.toFixed(2)}x. Prediksi Net Margin: ${finalRes.netMargin.toFixed(2)}%. Silakan Terapkan.`)
      setIsSolving(false)
    }, 600)
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-indigo-700">
            <Sparkles className="h-5 w-5" /> AI Target Profit Solver
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Sistem Autopilot akan mengeksekusi simulasi *reverse-engineering* terhadap ratusan kombinasi RAB untuk mencari konfigurasi Harga Jual paling optimal agar mencapai target Profit Netto Anda.
          </p>
          <div className="space-y-1">
            <Label>Target Net Margin (%)</Label>
            <div className="relative">
              <Input type="number" value={targetMargin} onChange={e => setTargetMargin(parseFloat(e.target.value)||0)} className="pr-8 h-12 text-lg font-bold text-center" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
          </div>
          
          <div className="space-y-2 mt-2">
            <Label>Pilih Tipe Bangunan yang Diubah Harganya:</Label>
            <div className="space-y-2 border border-border p-3 rounded-lg max-h-40 overflow-y-auto bg-slate-50">
              {inputs.tipeBangunan.map(t => (
                <label key={t.id} className="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-slate-100 p-1 rounded-md transition-colors">
                  <input type="checkbox" className="w-4 h-4 rounded text-indigo-600" checked={selectedTargets.includes(t.id)} onChange={e => {
                    if (e.target.checked) setSelectedTargets([...selectedTargets, t.id])
                    else setSelectedTargets(selectedTargets.filter(id => id !== t.id))
                  }} />
                  {t.kategori === 'apartemen' ? `🏢 ${t.nama} (Apartemen)` : `🏠 ${t.nama} (Landed)`}
                </label>
              ))}
            </div>
          </div>
          
          {resultMsg && (
            <div className="bg-sky-50 text-sky-800 p-3 rounded-lg text-sm border border-sky-200">
              {resultMsg}
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between items-center">
          <Button variant="ghost" onClick={onClose} disabled={isSolving}>Batal</Button>
          {!proposedInputs ? (
            <Button onClick={handleSolve} disabled={isSolving} className="bg-indigo-600 hover:bg-indigo-700">
              {isSolving ? <span className="flex items-center gap-2"><Activity className="animate-spin h-4 w-4"/> Kalkulasi...</span> : 'Mulai Auto-Solve'}
            </Button>
          ) : (
            <Button onClick={() => { onChange({ tipeBangunan: proposedInputs.tipeBangunan }); onClose() }} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
               Terapkan Harga Baru
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3 text-center border border-border">
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
      <div className="font-mono font-bold text-sm mt-1">{value}</div>
      {sub && <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-1">{sub}</div>}
    </div>
  )
}
