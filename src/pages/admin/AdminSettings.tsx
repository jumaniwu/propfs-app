import { useState, useEffect } from 'react'
import { Settings, ToggleRight, ToggleLeft, Percent, Save, RefreshCw, Building2, BarChart3, Clock } from 'lucide-react'
import { supabase, type AppFeature } from '@/lib/supabase'
import { useAuthStore, type BankDetails, DEFAULT_BANK_DETAILS } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const { isSubscriptionEnabled, loadFeatureFlags, globalFeatures, bankDetails } = useAuthStore()

  // PPN State
  const [ppnPct, setPpnPct]       = useState(11)
  const [ppnInput, setPpnInput]   = useState('11')
  const [savingPPN, setSavingPPN] = useState(false)
  const [loadingPPN, setLoadingPPN] = useState(true)

  // Bank Details State
  const [bankForm, setBankForm] = useState<BankDetails>(DEFAULT_BANK_DETAILS)
  const [savingBank, setSavingBank] = useState(false)

  // GA State
  const [gaId, setGaId] = useState('')
  const [savingGa, setSavingGa] = useState(false)

  // Trial Config State
  const [trialDays, setTrialDays] = useState(30)
  const [trialFeatures, setTrialFeatures] = useState({
    max_projects: 3,
    can_export_pdf: true,
    can_access_cashflow: true,
    can_use_ai_parser: true,
    ai_parser_limit: 3,
    can_export_excel: false,
  })
  const [savingTrial, setSavingTrial] = useState(false)

  useEffect(() => {
    if (bankDetails) setBankForm(bankDetails)
  }, [bankDetails])

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

        const { data: gaData } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'google_analytics_id')
          .maybeSingle()
        if (gaData?.value) {
          // It might be stored as a string with quotes from SQL, strip them
          setGaId(typeof gaData.value === 'string' ? gaData.value.replace(/"/g, '') : '')
        }
      } catch { /* use default */ } finally { setLoadingPPN(false) }
    }
    loadPPN()

    async function loadTrialSettings() {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['trial_duration_days', 'trial_features'])
      
      const days = data?.find(i => i.key === 'trial_duration_days')?.value
      const features = data?.find(i => i.key === 'trial_features')?.value
      
      if (days) setTrialDays(Number(days))
      if (features && typeof features === 'object') {
        setTrialFeatures(features as any)
      }
    }
    loadTrialSettings()
  }, [])

  async function updateGlobalFlag(key: AppFeature, val: boolean) {
    const newFlags = { ...globalFlags, [key]: val }
    setGlobalFlags(newFlags)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'feature_flags', value: newFlags })
    
    if (error) {
      toast({ title: 'Gagal mengubah setting', description: error.message, variant: 'destructive' })
      setGlobalFlags(globalFlags)
    } else {
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
      
      const { data: existing } = await supabase.from('app_settings').select('key').eq('key', 'ppn_rate').maybeSingle()
      let error
      if (existing) {
        const res = await supabase.from('app_settings').update({ value: rate }).eq('key', 'ppn_rate')
        error = res.error
      } else {
        const res = await supabase.from('app_settings').insert({ key: 'ppn_rate', value: rate })
        error = res.error
      }
      
      if (error) throw error
      invalidatePPNCache()
      setPpnPct(pct)
      toast({ title: `PPN berhasil diubah menjadi ${pct}%` })
    } catch (err: any) {
      toast({ title: 'Gagal menyimpan PPN', description: err.message, variant: 'destructive' })
    } finally { setSavingPPN(false) }
  }

  async function saveBankDetails() {
    setSavingBank(true)
    try {
      const { data: existing } = await supabase.from('app_settings').select('key').eq('key', 'bank_details').maybeSingle()
      let error
      
      if (existing) {
        const res = await supabase.from('app_settings').update({ value: bankForm }).eq('key', 'bank_details')
        error = res.error
      } else {
        const res = await supabase.from('app_settings').insert({ key: 'bank_details', value: bankForm })
        error = res.error
      }
      
      if (error) throw error
      await loadFeatureFlags()
      toast({ title: 'Detail Bank Berhasil Disimpan' })
    } catch (err: any) {
      toast({ title: 'Gagal menyimpan Detail Bank', description: err.message, variant: 'destructive' })
    } finally {
      setSavingBank(false)
    }
  }

  async function saveGaSettings() {
    setSavingGa(true)
    try {
      const { data: existing } = await supabase.from('app_settings').select('key').eq('key', 'google_analytics_id').maybeSingle()
      let error
      
      if (existing) {
        const res = await supabase.from('app_settings').update({ value: gaId }).eq('key', 'google_analytics_id')
        error = res.error
      } else {
        const res = await supabase.from('app_settings').insert({ key: 'google_analytics_id', value: gaId })
        error = res.error
      }
      
      if (error) throw error
      toast({ title: 'Google Analytics ID Berhasil Disimpan' })
    } catch (err: any) {
      toast({ title: 'Gagal menyimpan GA ID', description: err.message, variant: 'destructive' })
    } finally {
      setSavingGa(false)
    }
  }

  async function saveTrialSettings() {
    setSavingTrial(true)
    try {
      const updates = [
        { key: 'trial_duration_days', value: trialDays },
        { key: 'trial_features', value: trialFeatures },
      ]
      for (const update of updates) {
        const { data: existing } = await supabase.from('app_settings').select('key').eq('key', update.key).maybeSingle()
        if (existing) {
          await supabase.from('app_settings').update({ value: update.value }).eq('key', update.key)
        } else {
          await supabase.from('app_settings').insert({ key: update.key, value: update.value })
        }
      }
      toast({ title: '✅ Pengaturan Trial Tersimpan' })
    } catch (err: any) {
      toast({ 
        title: 'Gagal Menyimpan', 
        description: err.message, 
        variant: 'destructive' 
      })
    } finally {
      setSavingTrial(false)
    }
  }

  async function toggleSubscription() {
    setToggling(true)
    try {
      const newVal = !isSubscriptionEnabled
      
      const { data: existing } = await supabase.from('app_settings').select('key').eq('key', 'subscription_enabled').maybeSingle()
      let error
      if (existing) {
        const res = await supabase.from('app_settings').update({ value: newVal }).eq('key', 'subscription_enabled')
        error = res.error
      } else {
        const res = await supabase.from('app_settings').insert({ key: 'subscription_enabled', value: newVal })
        error = res.error
      }
      
      if (error) throw error
      await loadFeatureFlags()
      toast({
        title: `Subscription System ${newVal ? 'AKTIF' : 'NONAKTIF'}`,
        description: newVal
          ? 'User sekarang dibatasi berdasarkan paket (Free/Basic/Pro).'
          : 'Semua user bisa akses semua fitur bebas.',
      })
    } catch (err: any) {
      toast({ title: 'Gagal mengubah setting', description: err.message, variant: 'destructive' })
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
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

      {/* ── Trial Configuration Section ── */}
      <section className="bg-white border border-slate-100 rounded-[32px] p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4 border-b border-slate-50 pb-6">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-navy">
              Konfigurasi Free Trial
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              Atur durasi & akses selama masa trial
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Durasi Trial */}
          <div className="space-y-3 p-6 bg-slate-50 rounded-2xl">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Durasi Trial (Hari)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="365"
                value={trialDays}
                onChange={e => setTrialDays(Number(e.target.value))}
                className="w-28 h-14 text-2xl font-black text-navy text-center bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-gold/10 focus:border-gold"
              />
              <div>
                <p className="font-black text-navy">Hari</p>
                <p className="text-xs text-slate-400">
                  Berlaku untuk user baru
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap mt-2">
              {[7, 14, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setTrialDays(d)}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${trialDays === d ? 'bg-navy text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-navy'}`}
                >
                  {d} hari
                </button>
              ))}
            </div>
          </div>

          {/* Fitur yang Aktif Selama Trial */}
          <div className="space-y-3 p-6 bg-slate-50 rounded-2xl">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Fitur Aktif Selama Trial
            </label>
            <div className="space-y-3">
              {[
                { key: 'can_export_pdf',      label: 'Ekspor PDF' },
                { key: 'can_access_cashflow', label: 'Cashflow & Sensitivitas' },
                { key: 'can_use_ai_parser',   label: 'AI RAB Parser' },
                { key: 'can_export_excel',    label: 'Ekspor Excel' },
              ].map(f => (
                <label key={f.key} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-bold text-navy">{f.label}</span>
                  <div
                    onClick={() => setTrialFeatures(prev => ({
                      ...prev,
                      [f.key]: !(prev as any)[f.key]
                    }))}
                    className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${(trialFeatures as any)[f.key] ? 'bg-navy' : 'bg-slate-300'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${(trialFeatures as any)[f.key] ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              ))}

              {/* Limit proyek */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-sm font-bold text-navy">
                  Max Proyek Trial
                </span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={trialFeatures.max_projects}
                  onChange={e => setTrialFeatures(prev => ({
                    ...prev, 
                    max_projects: Number(e.target.value)
                  }))}
                  className="w-16 h-9 text-center font-black text-navy bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-gold/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button
            className="bg-navy hover:bg-navy/90 text-white h-12 px-8 rounded-2xl font-black gap-2 w-full sm:w-auto"
            onClick={saveTrialSettings}
            disabled={savingTrial}
          >
            {savingTrial 
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Menyimpan...</>
              : <><Save className="h-4 w-4" /> Simpan Pengaturan Trial</>
            }
          </Button>
        </div>
      </section>

      {/* ── Bank & Manual Payment Management ── */}
      <div className="bg-card border border-border shadow-sm rounded-2xl p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold text-navy">Rekening Transfer Manual</h2>
            <p className="text-sm text-muted-foreground">Detail rekening BCA dan WhatsApp tujuan untuk konfirmasi pembayaran manual.</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="space-y-2">
              <label className="text-sm font-bold text-navy">Nama Bank</label>
              <Input value={bankForm.bankName} onChange={e => setBankForm({...bankForm, bankName: e.target.value})} placeholder="Contoh: BANK BCA" />
           </div>
           <div className="space-y-2">
              <label className="text-sm font-bold text-navy">Nomor Rekening</label>
              <Input value={bankForm.accountNumber} onChange={e => setBankForm({...bankForm, accountNumber: e.target.value})} placeholder="Contoh: 8210 555 123" />
           </div>
           <div className="space-y-2">
              <label className="text-sm font-bold text-navy">Atas Nama (A/N)</label>
              <Input value={bankForm.accountName} onChange={e => setBankForm({...bankForm, accountName: e.target.value})} placeholder="Contoh: PT. PropFS Digital Indonesia" />
           </div>
           <div className="space-y-2">
              <label className="text-sm font-bold text-navy">Nomor WhatsApp (Mulai dengan 08 / 62)</label>
              <Input value={bankForm.whatsapp} onChange={e => setBankForm({...bankForm, whatsapp: e.target.value})} placeholder="Contoh: 08110000000" />
           </div>
        </div>

        <div className="pt-2">
           <Button onClick={saveBankDetails} disabled={savingBank} className="w-full sm:w-auto gap-2">
             {savingBank ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
             Simpan Detail Rekening
           </Button>
        </div>
      </div>

      {/* ── Google Analytics ── */}
      <div className="bg-white border border-slate-100 rounded-[32px] p-6 sm:p-10 shadow-sm space-y-6">
        <div className="flex items-center gap-4 border-b border-slate-50 pb-6">
          <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-navy">Google Analytics</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              Tracking Pengunjung Website
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">
            GA4 Measurement ID
          </Label>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-mono font-bold text-navy focus:ring-4 focus:ring-gold/10 transition-all"
              placeholder="G-XXXXXXXXXX"
              value={gaId}
              onChange={e => setGaId(e.target.value)}
            />
            <Button onClick={saveGaSettings} disabled={savingGa} className="h-14 px-8 bg-navy text-white hover:bg-navy/90 rounded-2xl gap-2 font-bold shrink-0">
              {savingGa ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan ID
            </Button>
          </div>
          <p className="text-xs text-slate-400 ml-1 mt-2">
            Dapatkan Measurement ID dari Google Analytics 4 → Admin → Data Streams → Web Stream
          </p>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-xs text-blue-700 font-medium leading-relaxed">
            ⚠️ Setelah mengubah GA ID, Anda perlu update Environment Variable <code className="bg-blue-100 px-1 rounded">VITE_GA_ID</code> di Vercel dan redeploy agar perubahan aktif.
          </p>
        </div>
      </div>

      {/* ── Global Feature Management ── */}
      <div className="bg-card border border-border shadow-sm rounded-2xl p-6 lg:p-8 space-y-6">
         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
