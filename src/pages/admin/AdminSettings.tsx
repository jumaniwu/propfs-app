import { useState, useEffect } from 'react'
import { Settings, ToggleRight, ToggleLeft, Percent, Save, RefreshCw } from 'lucide-react'
import { supabase, type AppFeature } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invalidatePPNCache } from '@/hooks/usePPNRate'

const AVAILABLE_FEATURES: { key: AppFeature; label: string; desc: string }[] = [
  { key: 'fs_module', label: 'Feasibility Study (FS)', desc: 'Modul utama analisa kelayakan proyek properti.' },
  { key: 'cost_control', label: 'Cost Control (Global)', desc: 'Menyalakan menu/dashboard Cost Control.' },
  { key: 'cost_rab', label: 'Cost Control: RAB', desc: 'Tab RAB Proyek di dalam modul Cost Control.' },
  { key: 'cost_material', label: 'Cost Control: Material Schedule', desc: 'Tab Rekap Material di modul Cost Control.' },
  { key: 'cost_realisasi', label: 'Cost Control: Realisasi Biaya', desc: 'Tab Realisasi Biaya (Tracking) di modul Cost Control.' },
  { key: 'scurve', label: 'Cost Control: Kurva S', desc: 'Visualisasi grafik progres pembangunan.' },
  { key: 'ai_solver', label: 'AI Target Profit Solver', desc: 'Fitur optimasi harga otomatis berbasis AI.' },
  { key: 'pdf_export', label: 'PDF Report Export', desc: 'Kemampuan ekspor hasil analisa ke PDF.' },
  { key: 'dashboard_admin', label: 'Admin Dashboard', desc: 'Akses ke panel admin ini.' },
]

export default function AdminSettings() {
  const [globalFlags, setGlobalFlags] = useState<Record<string, boolean>>({})
  const [toggling, setToggling] = useState(false)
  const { isSubscriptionEnabled, loadFeatureFlags, globalFeatures } = useAuthStore()

  // PPN State
  const [ppnPct, setPpnPct]       = useState(11)
  const [ppnInput, setPpnInput]   = useState('11')
  const [savingPPN, setSavingPPN] = useState(false)
  const [loadingPPN, setLoadingPPN] = useState(true)

  useEffect(() => {
    setGlobalFlags(globalFeatures)
  }, [globalFeatures])

  // Load PPN from Supabase
  useEffect(() => {
    async function loadPPN() {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'ppn_rate')
          .maybeSingle()
        const rate = data?.value ?? 0.11
        setPpnPct(Math.round(Number(rate) * 100))
        setPpnInput(String(Math.round(Number(rate) * 100)))
      } catch { /* use default */ } finally { setLoadingPPN(false) }
    }
    loadPPN()
  }, [])

  async function updateGlobalFlag(key: AppFeature, val: boolean) {
    const newFlags = { ...globalFlags, [key]: val }
    setGlobalFlags(newFlags)
    const { error } = await supabase
      .from('app_settings')
      .update({ value: newFlags, updated_at: new Date().toISOString() })
      .eq('key', 'feature_flags')
    
    if (!error) {
      await loadFeatureFlags()
      toast({ title: 'Setting Global diperbarui' })
    }
  }

  async function savePPN() {
    const pct = Number(ppnInput)
    if (isNaN(pct) || pct < 0 || pct > 99) {
      toast({ title: 'PPN tidak valid (0–99%)', variant: 'destructive' }); return
    }
    setSavingPPN(true)
    try {
      const rate = pct / 100
      // Upsert because key might not exist yet
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'ppn_rate', value: rate, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw error
      invalidatePPNCache()
      setPpnPct(pct)
      toast({ title: `PPN berhasil diubah menjadi ${pct}%` })
    } catch {
      toast({ title: 'Gagal menyimpan PPN', variant: 'destructive' })
    } finally { setSavingPPN(false) }
  }

  async function toggleSubscription() {
    setToggling(true)
    try {
      const newVal = !isSubscriptionEnabled
      const { error } = await supabase
        .from('app_settings')
        .update({ value: newVal, updated_at: new Date().toISOString() })
        .eq('key', 'subscription_enabled')
      if (error) throw error
      await loadFeatureFlags()
      toast({
        title: `Subscription System ${newVal ? 'AKTIF' : 'NONAKTIF'}`,
        description: newVal
          ? 'User sekarang dibatasi berdasarkan paket (Free/Basic/Pro).'
          : 'Semua user bisa akses semua fitur bebas.',
      })
    } catch {
      toast({ title: 'Gagal mengubah setting', variant: 'destructive' })
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-serif font-bold text-navy">Sistem & Fitur (Settings)</h1>
           <p className="text-sm text-muted-foreground mt-1">Nyalakan atau matikan fitur platform secara global untuk seluruh pengguna baru.</p>
        </div>
      </div>

      {/* ── PPN Rate Setting ── */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-gold" />
          <h2 className="font-serif text-xl font-bold">Tarif PPN (Pajak Pertambahan Nilai)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Tarif PPN ini dipakai pada semua perhitungan invoice. Harga paket di landing page sudah belum termasuk PPN.
          PPN akan ditambahkan otomatis saat checkout.
        </p>
        <div className="flex items-center gap-3">
          <div className="relative w-36">
            <Input
              type="number"
              min={0}
              max={99}
              value={ppnInput}
              onChange={e => setPpnInput(e.target.value)}
              className="pr-8 text-lg font-bold"
              disabled={loadingPPN}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">%</span>
          </div>
          <Button onClick={savePPN} disabled={savingPPN || loadingPPN} className="gap-2">
            {savingPPN ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan PPN
          </Button>
          <span className="text-sm text-muted-foreground">
            Berlaku sekarang: <strong>{loadingPPN ? '...' : `${ppnPct}%`}</strong>
          </span>
        </div>
      </div>

      {/* ── Subscription Toggle ── */}
      <div className="bg-gradient-to-r from-navy to-slate-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
         
         <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            <div>
               <div className="inline-flex items-center gap-2 px-3 py-1 bg-gold/20 text-yellow-300 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-gold/30">
                  <span className="relative flex h-2 w-2">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                  </span>
                  Paywall System
               </div>
               <h3 className="text-3xl font-serif font-bold text-white mb-2">Sistem Langganan Berbayar</h3>
               <p className="text-sm text-white/70 max-w-lg leading-relaxed">
                  Apabila sakelar ini digeser ke <b>Aktif</b>, pengguna baru akan mendapatkan limit sesuai *Tier Pricing* (Gratis hanya bisa membuat 2 proyek RAB). 
                  Jika nonaktif, sistem PropFS akan menjadi bebas (seluruh fitur dan ekspor PDF terbuka untuk umum).
               </p>
            </div>
            <button onClick={toggleSubscription} disabled={toggling} className="transition-transform active:scale-95 shrink-0 group">
               {isSubscriptionEnabled 
                 ? <ToggleRight className="h-20 w-20 text-gold drop-shadow-[0_0_15px_rgba(201,168,76,0.5)]" /> 
                 : <ToggleLeft className="h-20 w-20 text-white/20 group-hover:text-white/40" />
               }
               <div className="text-center font-bold text-sm tracking-widest uppercase mt-2">
                  {isSubscriptionEnabled ? <span className="text-gold">AKTIF</span> : <span className="text-white/40">NON-AKTIF</span>}
               </div>
            </button>
         </div>
      </div>

      {/* ── Global Feature Management ── */}
      <div className="bg-card border border-border shadow-sm rounded-2xl p-6 lg:p-8 space-y-6">
         <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold flex items-center gap-2"><Settings className="h-5 w-5 text-gold" /> Konfigurasi Modul Utama</h2>
            <div className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-widest">Global Effect</div>
         </div>
         <p className="text-sm text-muted-foreground/80 mb-6">Secara paksa menyembunyikan atau memunculkan sistem berikut dari dashboard pengguna.</p>
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {AVAILABLE_FEATURES.map(f => (
               <label key={f.key} className="flex gap-4 p-5 rounded-2xl border border-border bg-slate-50/50 hover:bg-slate-50 cursor-pointer group transition-colors">
                  <div className="pt-1">
                     <input 
                        type="checkbox" 
                        className="h-5 w-5 rounded border-gray-300 text-gold focus:ring-gold cursor-pointer"
                        checked={!!globalFlags[f.key]}
                        onChange={(e) => updateGlobalFlag(f.key, e.target.checked)}
                     />
                  </div>
                  <div>
                     <div className="text-base font-bold text-navy group-hover:text-gold transition-colors">{f.label}</div>
                     <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</div>
                  </div>
               </label>
            ))}
         </div>
      </div>
    </div>
  )
}
