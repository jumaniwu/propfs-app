import { useState } from 'react'
import { Save, Shield, Star, Crown, CheckCircle2, Layout, Smartphone, Tablet, Monitor, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

interface SaaSPlan {
  id: string
  name: string
  priceIdr: number
  maxProjects: number
  features: string[]
  recommended?: boolean
}

export default function AdminSaaSSettings() {
  const [plans, setPlans] = useState<SaaSPlan[]>([
    {
      id: 'free',
      name: 'Free Trial',
      priceIdr: 0,
      maxProjects: 2,
      features: ['2 Proyek FS', 'Kalkulasi NPV Dasar', '1 User']
    },
    {
      id: 'starter',
      name: 'Starter',
      priceIdr: 149000,
      maxProjects: 5,
      features: ['5 Proyek FS', 'Cost Control', 'Ekspor Excel']
    },
    {
      id: 'pro',
      name: 'Pro',
      priceIdr: 399000,
      maxProjects: 50,
      recommended: true,
      features: ['Tanpa Batas FS', 'Multi-user 3 orang', 'Ekspor PDF Branded']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      priceIdr: 999000,
      maxProjects: 999,
      features: ['Semua Fitur Pro', 'Akses API', 'White-label Reports']
    }
  ])

  function updatePlan(id: string, field: keyof SaaSPlan, value: any) {
    setPlans(plans.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  function handleSave() {
    toast({ title: 'Gagal Menyimpan ke Database', description: 'Fitur penyimpanan dinamis harga SaaS sedang dalam tahap integrasi schema.', variant: 'destructive' })
  }

  return (
    <div className="space-y-8 pb-10 px-0 sm:px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-0 bg-slate-50/90 backdrop-blur-xl pt-4 pb-6 z-10 border-b border-navy/5">
        <div className="space-y-1">
          <h2 className="font-serif text-3xl font-black text-navy tracking-tight">Katalog & Harga SaaS</h2>
          <p className="text-sm text-slate-500 font-medium">Atur nominal harga paket dan batasan limit proyek untuk pelanggan Anda.</p>
        </div>
        <Button variant="gold" className="w-full md:w-auto gap-3 h-14 px-10 text-lg font-black shadow-2xl shadow-gold/20 active:scale-95 transition-all" onClick={handleSave}>
          <Save className="h-5 w-5" /> SIMPAN HARGA
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className={`group relative p-6 sm:p-8 rounded-[32px] border-2 transition-all duration-500 overflow-hidden ${plan.recommended ? 'bg-navy text-white border-gold shadow-2xl' : 'bg-white border-slate-100 hover:border-gold/30 shadow-sm'}`}>
            
            {plan.recommended && (
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <Crown className="h-24 w-24 rotate-12" />
              </div>
            )}

            <div className="flex items-center gap-4 mb-8">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${plan.id === 'free' ? 'bg-slate-100 text-slate-500' : plan.id === 'starter' ? 'bg-emerald-50 text-emerald-600' : plan.id === 'pro' ? 'bg-gold text-navy' : 'bg-indigo-50 text-indigo-600'}`}>
                {plan.id === 'free' ? <Shield className="h-7 w-7" /> : plan.id === 'starter' ? <Star className="h-7 w-7" /> : plan.id === 'pro' ? <Crown className="h-7 w-7" /> : <Layout className="h-7 w-7" />}
              </div>
              <div className="space-y-0.5">
                <h3 className={`text-2xl font-black ${plan.recommended ? 'text-gold' : 'text-navy'}`}>{plan.name}</h3>
                <p className={`text-[10px] font-black uppercase tracking-widest ${plan.recommended ? 'text-white/40' : 'text-slate-400'}`}>System Plan ID: {plan.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-wider ${plan.recommended ? 'text-white/50' : 'text-slate-400'}`}>Harga Paket (IPR/Bulan)</label>
                <div className="relative">
                  <span className={`absolute left-4 top-4 font-bold ${plan.recommended ? 'text-white/50' : 'text-slate-400'}`}>Rp</span>
                  <input 
                    type="number"
                    className={`w-full h-14 pl-12 pr-4 rounded-2xl font-bold text-xl border-none focus:ring-4 focus:ring-gold/20 ${plan.recommended ? 'bg-white/10 text-white' : 'bg-slate-50 text-navy'}`}
                    value={plan.priceIdr}
                    onChange={(e) => updatePlan(plan.id, 'priceIdr', parseInt(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-wider ${plan.recommended ? 'text-white/50' : 'text-slate-400'}`}>Batas Maks. Proyek</label>
                <input 
                  type="number"
                  className={`w-full h-14 px-4 rounded-2xl font-bold text-xl border-none focus:ring-4 focus:ring-gold/20 ${plan.recommended ? 'bg-white/10 text-white' : 'bg-slate-50 text-navy'}`}
                  value={plan.maxProjects}
                  onChange={(e) => updatePlan(plan.id, 'maxProjects', parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className={`text-[10px] font-black uppercase tracking-wider ${plan.recommended ? 'text-white/50' : 'text-slate-400'}`}>Fitur Highlight</p>
              <div className="space-y-3">
                {plan.features.map((feat, i) => (
                  <div key={i} className={`flex items-center gap-3 p-4 rounded-2xl ${plan.recommended ? 'bg-white/5' : 'bg-slate-50'}`}>
                    <CheckCircle2 className={`h-4 w-4 ${plan.recommended ? 'text-gold' : 'text-emerald-500'}`} />
                    <input 
                      className="bg-transparent border-none text-sm font-bold flex-1 p-0 focus:ring-0"
                      value={feat}
                      onChange={(e) => {
                        const newFeats = [...plan.features]
                        newFeats[i] = e.target.value
                        updatePlan(plan.id, 'features', newFeats)
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border-2 border-amber-100 p-8 rounded-[40px] flex flex-col md:flex-row items-center gap-6">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shrink-0 shadow-lg">
          <Info className="h-8 w-8 text-amber-600" />
        </div>
        <div className="space-y-1 text-center md:text-left">
          <p className="font-black text-amber-900 text-lg">Catatan Penting Manajemen Paket</p>
          <p className="text-amber-800/70 text-sm font-medium leading-relaxed">Saat ini perubahan harga di halaman ini hanya tersimpan di memori browser (Demo). Untuk menerapkan ke gerbang pembayaran Midtrans, koordinasikan dengan tim IT untuk sinkronisasi Production API Key.</p>
        </div>
      </div>
    </div>
  )
}
