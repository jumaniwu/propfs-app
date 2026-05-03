import { useState, useEffect } from 'react'
import { Save, Shield, Star, Crown, Layout, Info, Tag, CheckCircle2, Circle, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'

// ── Master list of ALL features that can be toggled per plan ──
const MASTER_FEATURES = [
  { key: 'fs_projects', label: 'Feasibility Study (Proyek)', inputType: 'number' as const, suffix: 'proyek' },
  { key: 'cost_control', label: 'Cost Control & RAB', inputType: 'toggle' as const },
  { key: 'upload_rab', label: 'Upload & Parsing RAB Excel (AI)', inputType: 'toggle' as const },
  { key: 'material_schedule', label: 'Material Schedule Otomatis', inputType: 'toggle' as const },
  { key: 'kurva_s', label: 'Kurva S Progres Proyek', inputType: 'toggle' as const },
  { key: 'ai_chat', label: 'AI Chat Realisasi Biaya', inputType: 'toggle' as const },
  { key: 'export_excel', label: 'Ekspor Laporan Excel', inputType: 'toggle' as const },
  { key: 'export_pdf', label: 'Ekspor PDF Branded', inputType: 'toggle' as const },
  { key: 'multi_user', label: 'Multi-user / Tim', inputType: 'number' as const, suffix: 'user' },
  { key: 'api_access', label: 'Akses API (Integrasi ERP)', inputType: 'toggle' as const },
  { key: 'whitelabel', label: 'White-label Reports', inputType: 'toggle' as const },
  { key: 'priority_support', label: 'Prioritas Support (WA/24jam)', inputType: 'toggle' as const },
  { key: 'onboarding', label: 'Onboarding & Training Tim', inputType: 'toggle' as const },
]

interface SaaSPlan {
  id: string
  name: string
  priceIdr: number
  promoPriceIdr: number | null  // null = no promo
  maxProjects: number
  features: Record<string, boolean | number>  // key -> enabled/count
  recommended?: boolean
}

const DEFAULT_PLANS: SaaSPlan[] = [
  {
    id: 'free', name: 'Free Trial', priceIdr: 0, promoPriceIdr: null, maxProjects: 2,
    features: { fs_projects: 2, cost_control: false, upload_rab: false, material_schedule: false, kurva_s: false, ai_chat: false, export_excel: false, export_pdf: false, multi_user: 1, api_access: false, whitelabel: false, priority_support: false, onboarding: false }
  },
  {
    id: 'starter', name: 'Starter', priceIdr: 149000, promoPriceIdr: null, maxProjects: 5,
    features: { fs_projects: 5, cost_control: true, upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true, export_excel: true, export_pdf: false, multi_user: 1, api_access: false, whitelabel: false, priority_support: false, onboarding: false }
  },
  {
    id: 'pro', name: 'Pro', priceIdr: 399000, promoPriceIdr: null, maxProjects: 50, recommended: true,
    features: { fs_projects: 999, cost_control: true, upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true, export_excel: true, export_pdf: true, multi_user: 3, api_access: false, whitelabel: false, priority_support: true, onboarding: false }
  },
  {
    id: 'enterprise', name: 'Enterprise', priceIdr: 999000, promoPriceIdr: null, maxProjects: 999,
    features: { fs_projects: 999, cost_control: true, upload_rab: true, material_schedule: true, kurva_s: true, ai_chat: true, export_excel: true, export_pdf: true, multi_user: 999, api_access: true, whitelabel: true, priority_support: true, onboarding: true }
  }
]

function rp(n: number) { return `Rp ${n.toLocaleString('id-ID')}` }

export default function AdminPlans() {
  const [plans, setPlans] = useState<SaaSPlan[]>(DEFAULT_PLANS)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load saved plan catalog from DB on mount
  useEffect(() => {
    async function loadCatalog() {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'plan_catalog')
          .maybeSingle()
        
        if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
          setPlans(data.value)
        }
      } catch { /* use defaults */ }
      finally { setLoading(false) }
    }
    loadCatalog()
  }, [])

  function updatePlan(id: string, field: keyof SaaSPlan, value: any) {
    setPlans(plans.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  function toggleFeature(planId: string, featureKey: string) {
    setPlans(plans.map(p => {
      if (p.id !== planId) return p
      const current = p.features[featureKey]
      return {
        ...p,
        features: {
          ...p.features,
          [featureKey]: typeof current === 'number' ? current : !current
        }
      }
    }))
  }

  function setFeatureNumber(planId: string, featureKey: string, value: number) {
    setPlans(plans.map(p => {
      if (p.id !== planId) return p
      return {
        ...p,
        features: { ...p.features, [featureKey]: value }
      }
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'plan_catalog', value: plans })

      if (error) throw error
      toast({ title: '✅ Katalog Harga Tersimpan', description: 'Perubahan harga dan fitur paket berhasil disimpan ke database.' })
    } catch (err: any) {
      toast({ title: 'Gagal Menyimpan', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const PLAN_ICONS: Record<string, React.ElementType> = {
    free: Shield, starter: Star, pro: Crown, enterprise: Layout
  }
  const PLAN_COLORS: Record<string, string> = {
    free: 'bg-slate-100 text-slate-500',
    starter: 'bg-emerald-50 text-emerald-600',
    pro: 'bg-gold text-navy',
    enterprise: 'bg-indigo-50 text-indigo-600'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <RefreshCw className="h-6 w-6 animate-spin text-gold mr-3" />
        <span className="text-muted-foreground font-medium">Memuat katalog harga...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-0 bg-slate-50/90 backdrop-blur-xl pt-4 pb-6 z-10 border-b border-navy/5">
        <div className="space-y-1">
          <h2 className="font-serif text-3xl font-black text-navy tracking-tight">Katalog & Harga SaaS</h2>
          <p className="text-sm text-slate-500 font-medium">Atur harga normal, harga promo, dan fitur per paket.</p>
        </div>
        <Button 
          variant="gold" 
          className="w-full md:w-auto gap-3 h-14 px-10 text-lg font-black shadow-2xl shadow-gold/20 active:scale-95 transition-all" 
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} 
          {saving ? 'MENYIMPAN...' : 'SIMPAN HARGA'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map((plan) => {
          const PlanIcon = PLAN_ICONS[plan.id] || Shield
          const isPro = plan.recommended
          const hasPromo = plan.promoPriceIdr !== null && plan.promoPriceIdr > 0 && plan.promoPriceIdr < plan.priceIdr

          return (
            <div key={plan.id} className={`group relative p-6 sm:p-8 rounded-[32px] border-2 transition-all duration-500 overflow-hidden ${isPro ? 'bg-navy text-white border-gold shadow-2xl' : 'bg-white border-slate-100 hover:border-gold/30 shadow-sm'}`}>
              
              {isPro && (
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <Crown className="h-24 w-24 rotate-12" />
                </div>
              )}

              {/* Plan Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${PLAN_COLORS[plan.id] || 'bg-slate-100 text-slate-500'}`}>
                  <PlanIcon className="h-7 w-7" />
                </div>
                <div className="space-y-0.5 flex-1">
                  <h3 className={`text-2xl font-black ${isPro ? 'text-gold' : 'text-navy'}`}>{plan.name}</h3>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${isPro ? 'text-white/40' : 'text-slate-400'}`}>ID: {plan.id}</p>
                </div>
              </div>

              {/* Price Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-wider ${isPro ? 'text-white/50' : 'text-slate-400'}`}>Harga Normal (IDR/Bulan)</label>
                  <div className="relative">
                    <span className={`absolute left-4 top-4 font-bold ${isPro ? 'text-white/50' : 'text-slate-400'}`}>Rp</span>
                    <input 
                      type="number"
                      className={`w-full h-14 pl-12 pr-4 rounded-2xl font-bold text-xl border-none focus:ring-4 focus:ring-gold/20 ${isPro ? 'bg-white/10 text-white' : 'bg-slate-50 text-navy'}`}
                      value={plan.priceIdr}
                      onChange={(e) => updatePlan(plan.id, 'priceIdr', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isPro ? 'text-white/50' : 'text-slate-400'}`}>
                    <Tag className="h-3 w-3" /> Harga Promo (Opsional)
                  </label>
                  <div className="relative">
                    <span className={`absolute left-4 top-4 font-bold ${isPro ? 'text-white/50' : 'text-slate-400'}`}>Rp</span>
                    <input 
                      type="number"
                      placeholder="Kosongkan jika tidak promo"
                      className={`w-full h-14 pl-12 pr-4 rounded-2xl font-bold text-xl border-none focus:ring-4 focus:ring-gold/20 placeholder:text-sm placeholder:font-normal ${isPro ? 'bg-white/10 text-white placeholder:text-white/30' : 'bg-slate-50 text-navy placeholder:text-slate-300'}`}
                      value={plan.promoPriceIdr ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        updatePlan(plan.id, 'promoPriceIdr', val === '' ? null : parseInt(val) || 0)
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Price Preview */}
              {plan.priceIdr > 0 && (
                <div className={`p-4 rounded-2xl mb-6 ${isPro ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-100'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isPro ? 'text-white/40' : 'text-slate-400'}`}>Preview Harga di Landing Page:</p>
                  <div className="flex items-center gap-3">
                    {hasPromo ? (
                      <>
                        <span className={`text-lg line-through ${isPro ? 'text-white/40' : 'text-slate-400'}`}>{rp(plan.priceIdr)}</span>
                        <span className={`text-2xl font-black ${isPro ? 'text-gold' : 'text-emerald-600'}`}>{rp(plan.promoPriceIdr!)}</span>
                        <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                          HEMAT {Math.round((1 - plan.promoPriceIdr! / plan.priceIdr) * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className={`text-2xl font-black ${isPro ? 'text-white' : 'text-navy'}`}>{rp(plan.priceIdr)}</span>
                    )}
                    <span className={`text-sm ${isPro ? 'text-white/40' : 'text-slate-400'}`}>/bulan</span>
                  </div>
                </div>
              )}

              {/* Feature Checklist */}
              <div className="space-y-3">
                <p className={`text-[10px] font-black uppercase tracking-wider ${isPro ? 'text-white/50' : 'text-slate-400'}`}>Fitur Paket (Checklist)</p>
                <div className="space-y-1.5">
                  {MASTER_FEATURES.map(feat => {
                    const value = plan.features[feat.key]
                    const isEnabled = typeof value === 'number' ? value > 0 : !!value

                    return (
                      <div key={feat.key} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isPro ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                        <button
                          onClick={() => {
                            if (feat.inputType === 'number') {
                              const numVal = typeof value === 'number' ? value : 0
                              setFeatureNumber(plan.id, feat.key, numVal > 0 ? 0 : 1)
                            } else {
                              toggleFeature(plan.id, feat.key)
                            }
                          }}
                          className="shrink-0"
                        >
                          {isEnabled ? (
                            <CheckCircle2 className={`h-5 w-5 ${isPro ? 'text-gold' : 'text-emerald-500'}`} />
                          ) : (
                            <Circle className={`h-5 w-5 ${isPro ? 'text-white/20' : 'text-slate-300'}`} />
                          )}
                        </button>
                        <span className={`text-sm font-medium flex-1 ${isEnabled ? (isPro ? 'text-white' : 'text-navy') : (isPro ? 'text-white/30 line-through' : 'text-slate-400 line-through')}`}>
                          {feat.label}
                        </span>
                        {feat.inputType === 'number' && isEnabled && (
                          <input
                            type="number"
                            min={1}
                            className={`w-16 h-8 text-center rounded-lg text-xs font-bold border-none ${isPro ? 'bg-white/10 text-gold' : 'bg-slate-100 text-navy'}`}
                            value={typeof value === 'number' ? value : 1}
                            onChange={(e) => setFeatureNumber(plan.id, feat.key, parseInt(e.target.value) || 1)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-amber-50 border-2 border-amber-100 p-8 rounded-[40px] flex flex-col md:flex-row items-center gap-6">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shrink-0 shadow-lg">
          <Info className="h-8 w-8 text-amber-600" />
        </div>
        <div className="space-y-1 text-center md:text-left">
          <p className="font-black text-amber-900 text-lg">Cara Kerja Katalog</p>
          <p className="text-amber-800/70 text-sm font-medium leading-relaxed">
            Klik <strong>SIMPAN HARGA</strong> untuk menyimpan perubahan ke database. 
            Harga promo akan tampil di landing page dengan format coret harga normal. 
            Fitur yang dicentang akan ditampilkan sebagai ✅ di halaman pricing.
            Pastikan harga promo lebih rendah dari harga normal.
          </p>
        </div>
      </div>
    </div>
  )
}
