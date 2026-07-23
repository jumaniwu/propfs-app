import { useNavigate, useLocation } from 'react-router-dom'
import { 
  Building2, 
  Calculator, 
  BarChart3, 
  Settings, 
  ChevronRight,
  TrendingUp,
  FilePieChart,
  LayoutDashboard,
  LogOut,
  CheckCircle2,
  ArrowRight,
  Map
} from 'lucide-react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { fetchPPNRate } from '@/hooks/usePPNRate'
import { Card, CardContent } from '@/components/ui/card'
import { useFSStore } from '@/store/fsStore'
import { useCostStore } from '@/store/costStore'
import AIUsageWidget from '@/components/usage/AIUsageWidget'
import SubscriptionCard from '@/components/subscription/SubscriptionCard'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import { toast } from '@/hooks/use-toast'
import WelcomeModal from '@/components/onboarding/WelcomeModal'

export default function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, user, isFeatureEnabled, landingContent, signOut } = useAuthStore()
  const projects = useFSStore(s => s.projects) || []
  const fetchProjects = useFSStore(s => s.fetchProjects)
  
  const costProjects = useCostStore(s => s.savedProjects) || []
  const activeCostProject = useCostStore(s => s.projectInfo)
  const loadCostProjects = useCostStore(s => s.loadProjects)

  const [invoices, setInvoices] = useState<any[]>([])
  const { getCurrentPlan } = useAuthStore()

  // Welcome modal for new users
  const [showWelcome, setShowWelcome] = useState(() => {
    if (!user) return false
    const key = `propfs_welcome_shown_${user.id}`
    const alreadySeen = localStorage.getItem(key)
    const isNewUser = (profile?.total_projects_created ?? 0) === 0
    return !alreadySeen && isNewUser
  })

  function handleCloseWelcome() {
    if (user) {
      localStorage.setItem(`propfs_welcome_shown_${user.id}`, 'true')
    }
    setShowWelcome(false)
  }

  const sangatLayakCount = projects.filter(p => p?.results?.statusKelayakan === 'sangat_layak').length

  // Fetch projects on mount to ensure real-time data on dashboard
  useEffect(() => {
    fetchProjects()
    loadCostProjects()
  }, [fetchProjects, loadCostProjects])

  // Show upgrade toast when redirected from a locked feature
  useEffect(() => {
    const state = location.state as { upgradeNeeded?: string } | null
    if (state?.upgradeNeeded) {
      toast({
        title: 'Fitur Terkunci 🔒',
        description: 'Fitur Cost Control & RAB hanya tersedia untuk paket berbayar. Upgrade sekarang untuk mengakses.',
        variant: 'destructive',
      })
    }
  }, [])

  useEffect(() => {
    async function handleIncomingInvoiceAndFetch() {
      if (!profile?.id) return

      const query = new URLSearchParams(location.search)
      let createInvoicePlan = query.get('create_invoice')
      let months = parseInt(query.get('months') || '1')
      if (isNaN(months)) months = 1

      // Check localStorage for pending plan from registration (after email confirmation)
      if (!createInvoicePlan) {
        const pendingRaw = localStorage.getItem('propfs_pending_plan')
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw)
            if (pending.plan && pending.plan !== 'free') {
              createInvoicePlan = pending.plan
              months = pending.months || 1
              localStorage.removeItem('propfs_pending_plan') // consume it
            }
          } catch { /* ignore */ }
        }
      }

      if (createInvoicePlan) {
         // Fetch dynamic price from plan_catalog
         let basePrice = createInvoicePlan === 'pro' ? 399000 : 149000
         try {
           const { data: planData } = await supabase.from('app_settings').select('value').eq('key', 'plan_catalog').maybeSingle()
           if (planData && Array.isArray(planData.value)) {
             const selectedPlanData = planData.value.find((p: any) => p.id === createInvoicePlan)
             if (selectedPlanData && selectedPlanData.priceIdr) {
               basePrice = Number(selectedPlanData.priceIdr)
             }
           }
         } catch (e) {
           console.error('Gagal mengambil harga paket', e)
         }

         let subtotal = basePrice * months;
         if (months === 3) subtotal = Math.round(subtotal * 0.90) // 10% discount
         if (months === 12) subtotal = Math.round(subtotal * 0.80) // 20% discount

         const ppnRate = await fetchPPNRate()
         const ppn = Math.round(subtotal * ppnRate)
         const grandTotal = subtotal + ppn
         
         const invoiceNumber = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*10000)}`
         const periodStart = new Date().toISOString()
         const periodEnd = new Date(Date.now() + months * 30 * 86400000).toISOString()
         
         const invoicePayload = {
            user_id: profile.id,
            plan_id: createInvoicePlan,
            invoice_number: invoiceNumber,
            period_start: periodStart,
            period_end: periodEnd,
            subtotal_idr: subtotal,
            ppn_idr: ppn,
            total_idr: grandTotal,
            status: 'pending' as const,
         }
         
         const { data: dbInvoice, error: dbError } = await supabase
            .from('invoices')
            .insert(invoicePayload)
            .select()
            .single()

         let invoiceId: string
         if (dbInvoice && !dbError) {
            invoiceId = dbInvoice.id
            localStorage.setItem(`propfs_invoice_${invoiceId}`, JSON.stringify({
               ...invoicePayload,
               id: invoiceId,
               created_at: dbInvoice.created_at,
            }))
         } else {
            console.warn('[Invoice] DB insert failed, using localStorage:', dbError?.message)
            invoiceId = `local_${Math.random().toString(36).substr(2,9)}`
            localStorage.setItem(`propfs_invoice_${invoiceId}`, JSON.stringify({
               ...invoicePayload,
               id: invoiceId,
               created_at: new Date().toISOString(),
            }))
         }
         navigate(`/payment/${invoiceId}`, { replace: true })
         return
      }

      // Fetch from Supabase First
      let allInvoices: any[] = []
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          
        if (data && !error) {
          allInvoices = [...data]
        }
      } catch (err) {
        console.error('Error fetching invoices from Supabase:', err)
      }

      // Merge with local mock invoices (if any)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('propfs_invoice_')) {
           const inv = JSON.parse(localStorage.getItem(key) || '{}')
           if (inv.user_id === profile.id && !allInvoices.find(existing => existing.id === inv.id)) {
             allInvoices.push(inv)
           }
        }
      }
      
      allInvoices.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setInvoices(allInvoices)
    }

    handleIncomingInvoiceAndFetch()
  }, [profile?.id, location.search])

  // Modul aplikasi (Admin Panel dipindah ke halaman Profil)
  const allFeatures = [
    {
      id: 'fs_module',
      title: 'Feasibility Study',
      desc: 'Analisa kelayakan finansial (NPV, IRR, Cashflow).',
      icon: <Calculator className="h-6 w-6" />,
      path: '/dashboard',
      visible: true,
      available: isFeatureEnabled('fs_module')
    },
    {
      id: 'siteplan',
      title: 'AI Architect',
      desc: 'Siteplan otomatis & render dari file CAD/PDF.',
      icon: <Map className="h-6 w-6" />,
      path: '/siteplan',
      visible: true,
      available: true
    },
    {
      id: 'cost_control',
      title: 'Kontraktor AI',
      desc: 'RAB vs realisasi, akuntan, SPK digital.',
      icon: <BarChart3 className="h-6 w-6" />,
      path: '/cost-control',
      visible: true,
      available: isFeatureEnabled('cost_control')
    },
  ]

  const features = allFeatures.filter(f => f.visible)
  const pendingInvoice = invoices.find(i => i.status && i.status !== 'paid')
  const currentPlan = getCurrentPlan()

  void signOut

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-gold/30 relative overflow-hidden">
      {/* Welcome Onboarding Modal */}
      {showWelcome && profile && (
        <WelcomeModal
          userName={profile.full_name || ''}
          onClose={handleCloseWelcome}
        />
      )}
      {/* Background Decorative Blobs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gold/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-100/50 rounded-full blur-[100px] translate-x-1/4 translate-y-1/4 pointer-events-none" />

      <Header />

      <main className="max-w-5xl mx-auto px-4 py-8 lg:py-12 relative z-10 space-y-8">
        {/* ── Sapaan ── */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">Selamat datang kembali,</p>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-navy leading-tight">
            {profile?.full_name || 'Pengguna'} <span className="align-middle">👋</span>
          </h1>
          {profile?.company && <p className="text-sm text-muted-foreground">{profile.company}</p>}
        </div>

        {/* ── Peringatan invoice belum dibayar ── */}
        {pendingInvoice && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">💳</div>
              <div>
                <p className="font-bold text-navy text-sm">Ada invoice menunggu pembayaran</p>
                <p className="text-xs text-muted-foreground">
                  No. {pendingInvoice.invoice_number} · Paket {(pendingInvoice.plan_id || '').toUpperCase()}
                </p>
              </div>
            </div>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold shrink-0"
              onClick={() => navigate(`/payment/${pendingInvoice.id}`)}>
              Bayar sekarang
            </Button>
          </div>
        )}

        {/* ── Statistik ringkas ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Proyek FS', value: projects.length, tone: 'text-navy' },
            { label: 'Sangat Layak', value: sangatLayakCount, tone: 'text-emerald-600' },
            { label: 'Proyek Kontraktor', value: costProjects.length, tone: 'text-navy' },
            { label: 'Paket Aktif', value: currentPlan.toUpperCase(), tone: 'text-gold-dark' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-border rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-black mt-1 ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── CTA utama ── */}
        <Button className="w-full h-14 bg-navy hover:bg-navy/90 text-gold text-base font-black rounded-2xl shadow-lg gap-2"
          onClick={() => navigate('/input')}>
          <Building2 className="h-5 w-5" /> Buat Proyek Baru
        </Button>

        {/* ── Modul ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Modul</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {features.map((feature) => {
              const isActiveCC = feature.id === 'cost_control' && activeCostProject
              return (
                <div
                  key={feature.id}
                  onClick={() => feature.available && navigate(feature.path)}
                  className={`
                    group relative bg-white rounded-2xl p-5 border transition-all duration-200
                    ${feature.available
                      ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 border-border hover:border-gold/40'
                      : 'opacity-40 grayscale cursor-not-allowed border-dashed'}
                    ${isActiveCC ? 'ring-2 ring-[#639922]/40' : ''}
                  `}
                >
                  <div className="w-11 h-11 rounded-xl bg-slate-100 text-navy flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    {feature.icon}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-navy group-hover:text-gold transition-colors">{feature.title}</h3>
                    {isActiveCC && <span className="text-[8px] font-bold uppercase bg-[#639922]/10 text-[#639922] px-1.5 py-0.5 rounded-full">aktif</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{feature.desc}</p>
                  <ArrowRight className="absolute bottom-4 right-4 w-4 h-4 text-navy/15 group-hover:text-navy/40 group-hover:translate-x-0.5 transition-all" />
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Aktivitas terbaru ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gold" /> Aktivitas Terbaru
            </h2>
            {projects.length > 0 && (
              <button className="text-xs font-semibold text-gold hover:underline" onClick={() => navigate('/dashboard')}>Lihat semua</button>
            )}
          </div>
          <div className="space-y-2">
            {[...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 4).map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-border hover:border-gold/40 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => navigate(`/result/${p.id}`)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-gold" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-navy text-sm truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 ${p.results?.statusKelayakan === 'sangat_layak' ? 'bg-emerald-100 text-emerald-700' : 'bg-gold/20 text-gold-dark'}`}>
                  {p.results?.statusKelayakan?.replace('_', ' ') || 'Draft'}
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground italic bg-white rounded-2xl border border-border">
                Belum ada proyek feasibility study.
              </div>
            )}
          </div>
        </div>

        {/* ── Langganan ringkas + AI usage ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-border rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Langganan</p>
              <p className="text-xl font-black text-navy mt-1">Paket {currentPlan.toUpperCase()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentPlan !== 'free' ? 'Aktif' : 'Free / Trial'} · Bergabung {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-4">
              {currentPlan !== 'pro' && (
                <Button size="sm" variant="gold" className="font-bold" onClick={() => navigate('/pricing')}>↑ Upgrade Paket</Button>
              )}
              <button className="text-xs font-semibold text-blue-600 hover:underline" onClick={() => navigate('/profile')}>
                Langganan &amp; invoice →
              </button>
            </div>
          </div>
          <AIUsageWidget planId="pro" />
        </div>
      </main>
    </div>
  )
}
