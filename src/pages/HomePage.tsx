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
  LogOut
} from 'lucide-react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useFSStore } from '@/store/fsStore'
import AIUsageWidget from '@/components/usage/AIUsageWidget'
import SubscriptionCard from '@/components/subscription/SubscriptionCard'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

export default function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, isFeatureEnabled, landingContent, signOut } = useAuthStore()
  const projects = useFSStore(s => s.projects)

  const [invoices, setInvoices] = useState<any[]>([])
  const { getCurrentPlan } = useAuthStore()

  useEffect(() => {
    async function handleIncomingInvoiceAndFetch() {
      if (!profile?.id) return

      const query = new URLSearchParams(location.search)
      const createInvoicePlan = query.get('create_invoice')

      if (createInvoicePlan) {
         // Cek existing pending invoice
         const { data: existing } = await supabase.from('invoices')
            .select('id')
            .eq('user_id', profile.id)
            .eq('status', 'pending')
            .eq('plan_id', createInvoicePlan)
            .maybeSingle()
         
         if (!existing) {
            const subtotal = createInvoicePlan === 'pro' ? 399000 : 149000 // default 1 bulan
            const ppn = Math.round(subtotal * 0.11)
            
            await supabase.from('invoices').insert({
               user_id: profile.id,
               plan_id: createInvoicePlan,
               invoice_number: `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*10000)}`,
               period_start: new Date().toISOString(),
               period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
               subtotal_idr: subtotal,
               ppn_idr: ppn,
               total_idr: subtotal + ppn,
               status: 'pending'
            })
         }
         navigate('/home', { replace: true })
      }

      // Fetch
      const { data } = await supabase.from('invoices')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
      if (data) setInvoices(data)
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
      available: true
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
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-gold/30 relative overflow-hidden">
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
                   <th className="px-4 py-3 border-r border-[#7ab332] w-32">Tanggal Join</th>
                   <th className="px-4 py-3 w-40 text-center">Link Login</th>
                 </tr>
               </thead>
               <tbody>
                  <tr>
                    <td className="px-4 py-5 border-r border-b font-medium text-emerald-600 align-top">Active</td>
                    <td className="px-4 py-5 border-r border-b font-bold text-navy align-top">PropFS - Feasibility Study & Cost Control System</td>
                    <td className="px-4 py-5 border-r border-b align-top text-xs font-bold text-navy">
                      {getCurrentPlan().toUpperCase()}
                      <br/>
                      <button onClick={() => navigate('/pricing')} className="text-blue-600 font-medium hover:underline mt-1 font-normal flex items-center gap-1">↑ Upgrade Paket</button>
                    </td>
                    <td className="px-4 py-5 border-r border-b align-top font-bold text-navy">{projects.length}</td>
                    <td className="px-4 py-5 border-r border-b align-top text-xs text-muted-foreground whitespace-nowrap">
                      {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'}) : '-'}
                    </td>
                    <td className="px-4 py-5 border-b text-center align-top">
                      <Button size="sm" className="bg-navy hover:bg-navy/90 text-white font-bold w-full" onClick={() => navigate('/dashboard')}>
                        Akses Sistem
                      </Button>
                    </td>
                  </tr>
                  
                  {/* Invoices List Row */}
                  <tr>
                    <td colSpan={6} className="px-6 py-6 bg-slate-50 border-b">
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
                                   <span className="text-blue-600 hover:underline cursor-pointer" onClick={() => navigate('/profile')}>Invoice</span> (Sudah Dibayar)
                                 </div>
                               ) : (
                                 <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mt-1">
                                    <span className="text-muted-foreground text-xs font-medium">
                                      Invoice No: <span className="font-bold text-navy">{inv.invoice_number}</span> ({new Date(inv.created_at).toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'})})
                                    </span>
                                    <Button size="sm" className="h-7 px-4 text-xs bg-blue-600 hover:bg-blue-700 font-bold rounded shadow-sm self-start sm:self-auto" onClick={() => navigate(`/payment/${inv.id}`)}>
                                       Bayar
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
          {features.map((feature) => (
            <div 
              key={feature.id}
              onClick={() => feature.available && navigate(feature.path)}
              className={`
                group relative bg-white border border-border shadow-sm rounded-3xl p-8 
                transition-all duration-300 overflow-hidden
                ${feature.available 
                  ? 'cursor-pointer hover:bg-slate-50 hover:border-gold/30 hover:shadow-xl hover:shadow-gold/5 hover:-translate-y-1' 
                  : 'opacity-40 grayscale cursor-not-allowed border-dashed'
                }
              `}
            >
              <div className="relative z-10 space-y-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 bg-slate-100 text-navy`}>
                  {feature.icon}
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-black tracking-tight text-navy group-hover:text-gold transition-colors">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm font-medium">
                    {feature.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
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
              {projects.slice(0, 3).map(p => (
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
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${p.results?.status === 'sangat_layak' ? 'bg-green-500/20 text-green-400' : 'bg-gold/20 text-gold'}`}>
                    {p.results?.status?.replace('_', ' ') || 'Draft'}
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
                      ? Math.round((projects.filter(p => p.results?.status === 'sangat_layak').length / projects.length) * 100) 
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
