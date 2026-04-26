import { useState, useEffect } from 'react'
import { Save, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, CreditCard, LayoutDashboard, Database, HardDrive, BarChart3, ChevronRight, Settings2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { Link } from 'react-router-dom'

export default function AdminSettings() {
  const { profile } = useAuthStore()
  const [ppnRate, setPpnRate] = useState<string>('11')
  const [loadingPPN, setLoadingPPN] = useState(true)
  const [savingPPN, setSavingPPN] = useState(false)
  const [isSubsEnabled, setIsSubsEnabled] = useState(true)
  const [updatingSubs, setUpdatingSubs] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoadingPPN(true)
    const { data } = await supabase
      .from('app_settings')
      .select('*')
    
    if (data) {
      const ppn = data.find(s => s.key === 'ppn_rate')
      const subs = data.find(s => s.key === 'subscription_enabled')
      if (ppn) setPpnRate(ppn.value)
      if (subs) setIsSubsEnabled(subs.value === 'true' || subs.value === true)
    }
    setLoadingPPN(false)
  }

  async function savePPN() {
    setSavingPPN(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'ppn_rate', value: ppnRate, updated_at: new Date().toISOString() })
    
    if (error) {
      toast({ title: 'Gagal', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Berhasil', description: 'Tarif PPN diperbarui.' })
    }
    setSavingPPN(false)
  }

  async function toggleSubscription(checked: boolean) {
    setUpdatingSubs(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'subscription_enabled', value: checked, updated_at: new Date().toISOString() })
    
    if (error) {
      toast({ title: 'Gagal', description: error.message, variant: 'destructive' })
    } else {
      setIsSubsEnabled(checked)
      toast({ title: 'Berhasil', description: `Paywall sekarang ${checked ? 'Aktif' : 'Non-aktif'}.` })
    }
    setUpdatingSubs(false)
  }

  const ppnPct = parseInt(ppnRate) || 0

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
             <div className="p-2 bg-navy/5 rounded-xl">
                <Settings2 className="w-6 h-6 text-navy" />
             </div>
             <h1 className="text-4xl font-serif font-black text-navy">System Settings</h1>
          </div>
          <p className="text-slate-500 font-medium">Konfigurasi global platform PropFS</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* ── PPN Section ── */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-6">
             <div className="p-2 bg-amber-50 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
             </div>
             <h3 className="text-xl font-bold text-navy">Pajak Pertambahan Nilai (PPN)</h3>
          </div>
          
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            Atur persentase PPN yang akan diterapkan pada seluruh Invoice di sistem. Perubahan ini akan langsung berdampak pada simulasi harga di Landing Page.
          </p>

          <div className="flex items-center gap-6 mb-8">
            <div className="relative flex-1 max-w-[200px]">
              <Input 
                type="number" 
                value={ppnRate}
                onChange={(e) => setPpnRate(e.target.value)}
                className="h-16 text-2xl font-black pl-6 pr-12 border-slate-200 focus:ring-navy rounded-2xl"
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-xl text-slate-400">%</span>
            </div>
            
            <div className="flex-1">
               <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-1">Status Pajak</span>
                  <span className="text-navy font-bold flex items-center gap-2">
                     <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Aktif Secara Global
                  </span>
               </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-50">
             <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                <AlertCircle className="w-3 h-3" /> Rekomendasi Pemerintah: 11%
             </div>
             <Button 
                onClick={savePPN} 
                disabled={savingPPN || loadingPPN} 
                className="bg-navy hover:bg-navy/90 text-gold font-bold px-8 h-12 rounded-xl transition-all active:scale-95"
             >
               {savingPPN ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
               Simpan Perubahan
             </Button>
          </div>
        </div>

        {/* ── Summary Card ── */}
        <div className="bg-slate-900 rounded-3xl p-8 text-white flex flex-col justify-between relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
           
           <div>
              <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Current Configuration</h4>
              <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">PPN Rate</span>
                    <span className="text-2xl font-black text-gold">{ppnPct}%</span>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Subs Payment</span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${isSubsEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                       {isSubsEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                 </div>
              </div>
           </div>

           <div className="mt-12 pt-8 border-t border-white/10 text-[10px] text-slate-500 font-medium italic">
              Last updated: {new Date().toLocaleDateString()}
           </div>
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
                  Aktifkan paywall untuk memaksa user baru melakukan pembayaran sebelum bisa menggunakan dashboard utama. Gunakan mode Non-aktif untuk masa testing massal.
               </p>
            </div>

            <div className="flex flex-col items-center gap-4 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-sm">
               <span className={`text-xs font-bold tracking-widest ${isSubsEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                  STATUS: {isSubsEnabled ? 'ACTIVE' : 'BYPASSED'}
               </span>
               <Switch 
                  checked={isSubsEnabled}
                  onCheckedChange={toggleSubscription}
                  disabled={updatingSubs}
                  className="data-[state=checked]:bg-emerald-500 scale-125"
               />
               <span className="text-[10px] text-white/40 italic text-center">Tindakan ini akan <br/>berdampak instan.</span>
            </div>
         </div>
      </div>

      {/* ── Bottom Section ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <Link to="/admin" className="group">
            <div className="bg-white border border-slate-100 p-6 rounded-2xl flex items-center justify-between hover:border-navy hover:shadow-lg transition-all duration-300">
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-navy/5 rounded-xl group-hover:bg-navy group-hover:text-gold transition-colors">
                     <LayoutDashboard className="w-5 h-5" />
                  </div>
                  <div>
                     <h4 className="font-bold text-navy">Kembali ke Dashboard</h4>
                     <p className="text-[10px] text-slate-400 font-medium">Monitor statistik real-time</p>
                  </div>
               </div>
               <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-navy group-hover:translate-x-1 transition-all" />
            </div>
         </Link>

         <div className="bg-white border border-slate-100 p-6 rounded-2xl flex items-center justify-between border-dashed opacity-60">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-slate-100 rounded-xl">
                  <Database className="w-5 h-5 text-slate-400" />
               </div>
               <div>
                  <h4 className="font-bold text-slate-400">Database Backup</h4>
                  <p className="text-[10px] text-slate-300 font-medium italic">Available on Enterprise plan</p>
               </div>
            </div>
            <ShieldCheck className="w-5 h-5 text-slate-200" />
         </div>
      </div>

    </div>
  )
}
