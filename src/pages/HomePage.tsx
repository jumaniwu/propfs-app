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
  ArrowRight
} from 'lucide-react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
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

  const totalRAB = costProjects.reduce((acc, p) => acc + (p?.plan?.totalBaselineBudget || 0), 0)
  const sangatLayakCount = projects.filter(p => p?.results?.statusKelayakan === 'sangat_layak').length
  const totalRABFormatted = totalRAB > 0 ? `Rp ${(totalRAB / 1000000000).toFixed(1)}M` : '—'

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
      const createInvoicePlan = query.get('create_invoice')
      const monthsParam = parseInt(query.get('months') || '1')
      const months = isNaN(monthsParam) ? 1 : monthsParam

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

         const ppn = Math.round(subtotal * 0.11)
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

  const isSuperAdmin = profile?.role === 'superadmin'

  // Define modules
  const allFeatures = [
    {
      id: 'fs_module',
      title: 'Feasibility Study',
      desc: 'Analisa kelayakan finansial proyek properti (NPV, IRR, Cashflow).',
      icon: <Calculator className="h-7 w-7" />,
      path: '/dashboard',
      color: 'bg-slate-100 text-navy',
      visible: true,
      available: isFeatureEnabled('fs_module')
    },
    {
      id: 'cost_control',
      title: 'Cost Control & RAB',
      desc: 'Tracking anggaran RAB vs Realisasi lapangan dengan Kurva S.',
      icon: <BarChart3 className="h-7 w-7" />,
      path: '/cost-control',
      color: 'bg-slate-100 text-navy',
      visible: true,
      available: isFeatureEnabled('cost_control')
    },
    {
      id: 'admin_panel',
      title: 'Admin Panel',
      desc: 'Manajemen user, langganan, dan pengaturan sistem.',
      icon: <Settings className="h-7 w-7" />,
      path: '/admin',
      color: 'bg-slate-100 text-navy',
      visible: isSuperAdmin,
      available: true
    }
  ]

  const features = allFeatures.filter(f => f.visible)

  async function handleLogout() {
    await signOut()
    window.location.href = '/'
  }

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
      
      <main className="max-w-7xl mx-auto px-4 py-16 lg:py-24 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 mb-16">
          <div className="space-y-3">
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-navy leading-tight">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-xl font-medium max-w-2xl">
              Pusat kendali operasional dan analisa sistem {landingContent.branding.siteName}.
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap items-center gap-4 bg-white/60 backdrop-blur-sm border border-border/50 rounded-xl px-5 py-3 mt-4 w-fit shadow-sm">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total proyek</span>
                <span className="text-base font-bold text-navy">{projects.length}</span>
              </div>
              <div className="w-px h-8 bg-border/60 mx-2" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sangat Layak</span>
                <span className="text-base font-bold text-emerald-600">{sangatLayakCount} proyek</span>
              </div>
              <div className="w-px h-8 bg-border/60 mx-2" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Nilai RAB</span>
                <span className="text-base font-bold text-navy">{totalRABFormatted}</span>
              </div>
              <div className="w-px h-8 bg-border/60 mx-2" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bergabung sejak</span>
                <span className="text-base font-bold text-navy">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'}) : '-'}
                </span>
              </div>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            onClick={handleLogout} 
            className="bg-transparent border-border text-navy hover:text-navy hover:bg-slate-100 font-bold gap-2 px-6 h-12 rounded-xl shrink-0"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </Button>
        </div>

        {/* ── ERP360 Style Company & Subscription Table ── */}
        <div className="mb-16">
          <h2 className="text-xl md:text-2xl font-black uppercase mb-4 text-navy">
            {profile?.company || 'Nama Perusahaan'}
          </h2>
          
          <div className="bg-white rounded-xl shadow-sm border border-border overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[800px]">
               <thead className="bg-[#8cc63f] text-white">
                 <tr>
                   <th className="px-4 py-3 border-r border-[#7ab332] w-24">Status</th>
                   <th className="px-4 py-3 border-r border-[#7ab332]">Nama Produk</th>
                   <th className="px-4 py-3 border-r border-[#7ab332] w-32">Paket</th>
                   <th className="px-4 py-3 border-r border-[#7ab332] w-24">Proyek</th>
                   <th className="px-4 py-3 w-40">Tanggal Join</th>
                 </tr>
               </thead>
               <tbody>
                  <tr>
                    <td className={`px-4 py-5 border-r border-b font-medium align-top ${getCurrentPlan() !== 'free' ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {getCurrentPlan() !== 'free' ? 'Active' : 'Free / Trial'}
                    </td>
                    <td className="px-4 py-5 border-r border-b font-bold text-navy align-top">PropFS - Feasibility Study & Cost Control System</td>
                    <td className="px-4 py-5 border-r border-b align-top text-xs font-bold text-navy">
                      {getCurrentPlan().toUpperCase()}
                      <br/>
                      <button onClick={() => navigate('/pricing')} className="text-blue-600 font-medium hover:underline mt-1 font-normal flex items-center gap-1">↑ Upgrade Paket</button>
                    </td>
                    <td className="px-4 py-5 border-r border-b align-top font-bold text-navy">{projects.length}</td>
                    <td className="px-4 py-5 border-b align-top text-xs text-muted-foreground whitespace-nowrap">
                      {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'}) : '-'}
                    </td>
                  </tr>
                  
                  {/* Invoices List Row */}
                  <tr>
                    <td colSpan={5} className="px-6 py-6 bg-slate-50 border-b">
                      <div className="space-y-6">
                        {invoices.length === 0 && (
                           <div className="flex flex-col gap-1.5 border-l-4 border-emerald-500 pl-4 py-1">
                             <div className="font-bold text-navy text-[13px]">Cycle #1 Paket {getCurrentPlan().toUpperCase()}</div>
                             <div className="text-muted-foreground text-xs font-medium">Invoice (Free / Aktif)</div>
                           </div>
                        )}
                        
                        {/* Render chronological invoices reversed to look like a history log */}
                        {[...invoices].reverse().map((inv, idx) => {
                           const cycleNum = idx + 1;
                           const isPaid = inv.status === 'paid'
                           return (
                             <div key={inv.id} className={`flex flex-col gap-1.5 border-l-4 pl-4 py-1 ${isPaid ? 'border-emerald-500' : 'border-amber-500'}`}>
                               <div className="font-bold text-navy text-[13px] uppercase">
                                 Cycle #{cycleNum} Paket {(inv as any).plan_id || 'PRO'}
                               </div>
                               {isPaid ? (
                                 <div className="text-muted-foreground text-xs font-medium flex items-center gap-2">
                                   <span className="text-emerald-600 flex items-center gap-1 font-bold">
                                     <CheckCircle2 className="w-3.5 h-3.5" /> Lunas
                                   </span>
                                   ·
                                   <span className="text-blue-600 hover:underline cursor-pointer" onClick={() => navigate('/profile')}>Invoice No: {inv.invoice_number}</span>
                                 </div>
                               ) : (
                                 <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mt-1">
                                    <span className="text-muted-foreground text-xs font-medium">
                                      Invoice No: <span className="font-bold text-navy">{inv.invoice_number}</span> ({new Date(inv.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'})})
                                    </span>
                                    <Button size="sm" className="h-7 px-4 text-xs bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-sm self-start sm:self-auto" onClick={() => navigate(`/payment/${inv.id}`)}>
                                       Bayar sekarang
                                    </Button>
                                 </div>
                               )}
                             </div>
                           )
                        })}
                      </div>
                    </td>
                  </tr>
               </tbody>
            </table>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {features.map((feature) => {
            const isActiveCC = feature.id === 'cost_control' && activeCostProject
            return (
            <div 
              key={feature.id}
              onClick={() => feature.available && navigate(feature.path)}
              className={`
                group relative bg-white shadow-sm rounded-3xl p-8 
                transition-all duration-300 overflow-hidden
                ${feature.available 
                  ? 'cursor-pointer hover:bg-slate-50 hover:shadow-xl hover:shadow-gold/5 hover:-translate-y-1' 
                  : 'opacity-40 grayscale cursor-not-allowed border-dashed'
                }
                ${isActiveCC ? 'border-2 border-[#639922]' : 'border border-border hover:border-slate-300'}
              `}
            >
              <div className="relative z-10 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 bg-slate-100 text-navy">
                    {feature.icon}
                  </div>
                  {isActiveCC && (
                    <div className="bg-[#639922]/10 text-[#639922] text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                      Sedang aktif
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-black tracking-tight text-navy group-hover:text-gold transition-colors">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm font-medium">
                    {feature.desc}
                  </p>
                  {isActiveCC && (
                    <p className="text-[#639922] text-[10px] font-medium pt-2">
                      Lanjutkan: {activeCostProject.projectName} · {activeCostProject.location} →
                    </p>
                  )}
                </div>
              </div>
              <ArrowRight className={`absolute bottom-6 right-6 w-5 h-5 transition-transform duration-200 ${feature.available ? 'text-navy/20 group-hover:text-navy/50 group-hover:translate-x-1' : 'text-slate-200'}`} />
            </div>
            )
          })}
        </div>

        {/* Stats / Recent Activity Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white border border-border shadow-sm rounded-[40px] p-10">
            <div className="flex items-center justify-between mb-10">
              <h2 className="font-serif text-2xl font-bold text-navy flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-gold" /> Aktivitas Proyek Terbaru
              </h2>
              <Button variant="ghost" className="text-gold hover:text-navy hover:bg-slate-100" onClick={() => navigate('/dashboard')}>Lihat Semua</Button>
            </div>
            
            <div className="space-y-4">
              {[...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3).map(p => (
                <div 
                  key={p.id} 
                  className="flex items-center justify-between p-5 rounded-[24px] bg-slate-50 hover:bg-slate-100 transition-all border border-transparent hover:border-border cursor-pointer group"
                  onClick={() => navigate(`/result/${p.id}`)}
                >
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center group-hover:bg-gold/10 transition-colors">
                      <Building2 className="h-6 w-6 text-gold" />
                    </div>
                    <div>
                      <div className="font-bold text-navy text-lg">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-medium">{new Date(p.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    </div>
                  </div>
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${p.results?.statusKelayakan === 'sangat_layak' ? 'bg-green-500/20 text-green-400' : 'bg-gold/20 text-gold'}`}>
                    {p.results?.statusKelayakan?.replace('_', ' ') || 'Draft'}
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <div className="py-20 text-center text-muted-foreground font-medium italic">
                  Belum ada proyek feasibility study.
                </div>
              )}
            </div>
          </div>

          {/* Right column: Career summary + AI Usage */}
          <div className="flex flex-col gap-6">
            <div className="bg-gradient-to-br from-gold to-gold-dark rounded-[40px] p-10 text-navy relative overflow-hidden flex flex-col justify-between shadow-lg shadow-gold/10 group">
              <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-125 transition-transform duration-1000">
                <FilePieChart className="w-64 h-64" />
              </div>
              
              <div>
                <h3 className="font-serif text-3xl font-black mb-2 italic">Ringkasan Karir</h3>
                <p className="text-navy/60 font-bold text-sm">Portfolio Properti Anda</p>
              </div>

              <div className="space-y-8 mt-12 relative z-10">
                <div className="flex justify-between items-end border-b border-navy/10 pb-4">
                  <div className="text-sm font-bold uppercase tracking-widest text-navy/60">Total Proyek</div>
                  <div className="text-5xl font-serif font-black">{projects.length}</div>
                </div>
                <div className="flex justify-between items-end border-b border-navy/10 pb-4">
                  <div className="text-sm font-bold uppercase tracking-widest text-navy/60">Success Rate</div>
                  <div className="text-5xl font-serif font-black">
                    {projects.length > 0 
                      ? Math.round((projects.filter(p => p.results?.statusKelayakan === 'sangat_layak').length / projects.length) * 100) 
                      : 0}%
                  </div>
                </div>
              </div>

              <Button className="w-full h-16 mt-12 bg-navy text-gold hover:bg-navy/90 text-lg font-black rounded-2xl shadow-xl relative z-10" onClick={() => navigate('/input')}>
                BUAT PROYEK BARU
              </Button>
            </div>

            {/* AI Usage Widget */}
            <AIUsageWidget planId="pro" />
          </div>
        </div>
      </main>
    </div>
  )
}
