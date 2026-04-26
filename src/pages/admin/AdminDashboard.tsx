import { useState, useEffect } from 'react'
import { Users, CreditCard, TrendingUp, RefreshCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

interface Stats {
  totalUsers:       number
  activeSubs:       number
  revenue:          number
  totalProjects:    number
  aiCostUSD:        number
}

export default function AdminDashboard() {
  const [stats, setStats]     = useState<Stats>({ totalUsers: 0, activeSubs: 0, revenue: 0, totalProjects: 0, aiCostUSD: 0 })
  const [recentProjects, setRecentProjects] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)
    try {
      const [usersRes, subsRes, invoicesRes, projectsRes, aiRes, projectsListRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('invoices').select('total_idr').eq('status', 'paid'), // Updated to invoices table
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('ai_usage_logs').select('cost_usd'),
        supabase.from('projects').select('*').order('updated_at', { ascending: false }).limit(10)
      ])
      const revenue = (invoicesRes.data ?? []).reduce((s: number, p: any) => s + (p.total_idr || 0), 0)
      const aiCostUSD = (aiRes.data ?? []).reduce((s: number, p: any) => s + (p.cost_usd || 0), 0)
      
      setStats({
        totalUsers:    usersRes.count ?? 0,
        activeSubs:    subsRes.count ?? 0,
        revenue,
        totalProjects: projectsRes.count ?? 0,
        aiCostUSD
      })
      setRecentProjects(projectsListRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  const StatCard = ({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) => (
    <div className="bg-card border border-border shadow-sm rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <p className="font-serif text-3xl font-bold text-navy">{value}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-serif font-bold text-navy">Statistik Utama</h1>
           <p className="text-sm text-muted-foreground mt-1">Ringkasan performa platform PropFS secara keseluruhan.</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadStats} className="gap-2 shrink-0">
           <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
           Segarkan Data
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard label="Total Perusahaan" value={stats.totalUsers}    icon={<Users className="h-5 w-5 text-blue-600" />}   color="bg-blue-50" />
        <StatCard label="Perusahaan Premium" value={stats.activeSubs}   icon={<CreditCard className="h-5 w-5 text-gold" />}  color="bg-gold/10" />
        <StatCard label="Total Revenue"    value={`Rp ${stats.revenue.toLocaleString('id-ID')}`} icon={<TrendingUp className="h-5 w-5 text-green-600" />} color="bg-green-50" />
        <StatCard label="Total Proyek Dibuat" value={stats.totalProjects}  icon={<LayoutDashboard className="h-5 w-5 text-purple-600" />} color="bg-purple-50" />
        <StatCard label="Total AI Cost" value={`$${stats.aiCostUSD.toFixed(3)}`} icon={<Zap className="h-5 w-5 text-amber-600" />} color="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border shadow-sm rounded-2xl p-8 flex flex-col justify-center">
            <h3 className="font-bold text-lg mb-2">Financial Health (Gross Margin)</h3>
            <p className="text-sm text-muted-foreground mb-6">Memonitor margin keuntungan bersih setelah dikurangi pengeluaran API AI.</p>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                 <span className="text-muted-foreground font-medium">1. Gross Revenue</span>
                 <span className="font-bold text-green-600">Rp {stats.revenue.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                 <span className="text-muted-foreground font-medium">2. Estimasi Beban Server AI (Rate Rp 16.000)</span>
                 <span className="font-bold text-red-500">- Rp {(stats.aiCostUSD * 16000).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                 <span className="text-navy font-black">NET PROFIT (SAAS)</span>
                 <span className="font-black text-2xl">Rp {(stats.revenue - (stats.aiCostUSD * 16000)).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
              </div>
              
              {(() => {
                const margin = stats.revenue > 0 ? ((stats.revenue - (stats.aiCostUSD * 16000)) / stats.revenue) * 100 : 0;
                const isDanger = margin > 0 && margin < 50;
                
                if (stats.revenue === 0) return (
                  <div className="mt-4 p-3 bg-slate-50 text-slate-500 text-xs rounded border text-center">Belum ada pendapatan untuk dihitung marginnya.</div>
                );
                
                return (
                  <div className={`mt-6 p-4 rounded-xl border ${isDanger ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'} flex items-start gap-4`}>
                     <div className={`p-2 rounded-full ${isDanger ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        <TrendingUp className="w-5 h-5" />
                     </div>
                     <div>
                        <div className={`font-black text-xl ${isDanger ? 'text-red-700' : 'text-emerald-700'}`}>{margin.toFixed(2)}% Margin</div>
                        <div className={`text-xs ${isDanger ? 'text-red-600' : 'text-emerald-700/80'} mt-1`}>
                          {isDanger ? 'Peringatan: Margin di bawah batas aman! Pengeluaran AI melebihi batas.' : 'Margin sehat! Pengeluaran sistem AI per pengguna sangat minim.'}
                        </div>
                     </div>
                  </div>
                )
              })()}
            </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center">
           <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
               <TrendingUp className="h-8 w-8 text-muted-foreground/50" />
           </div>
           <h3 className="font-bold text-lg">Grafik Aktivitas (Segera Hadir)</h3>
           <p className="text-sm text-muted-foreground max-w-sm mt-2">Nantinya Anda dapat memvisualisasikan grafik pendaftar vs margin bulanan di chart interaktif ini.</p>
        </div>
      </div>

      <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-slate-50/50 flex items-center justify-between">
           <h3 className="font-serif font-bold text-navy">Proyek FS Terbaru (Seluruh Sistem)</h3>
           <Button variant="link" onClick={() => window.location.href = '/dashboard'} className="text-blue-600 font-bold p-0 h-auto">Lihat di Dashboard Utama →</Button>
        </div>
        <div className="overflow-x-auto">
           <table className="w-full text-left text-sm">
              <thead>
                 <tr className="border-b border-border bg-slate-50 text-muted-foreground font-medium">
                    <th className="px-6 py-3">Nama Proyek</th>
                    <th className="px-6 py-3">User ID Owner</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Terakhir Update</th>
                    <th className="px-6 py-3 text-right">Aksi</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-border">
                 {loading ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center animate-pulse text-muted-foreground">Memuat daftar proyek...</td></tr>
                 ) : stats.totalProjects === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center italic text-muted-foreground">Belum ada proyek yang dibuat oleh user.</td></tr>
                 ) : (
                    recentProjects.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-navy">{p.name || 'Proyek Tanpa Nama'}</td>
                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground">{p.user_id}</td>
                        <td className="px-6 py-4">
                           <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${p.results?.status === 'sangat_layak' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                              {p.results?.status?.replace('_', ' ') || 'Draft'}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                           {new Date(p.updated_at).toLocaleString('id-ID', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'})}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <Button size="sm" variant="ghost" onClick={() => window.location.href = `/result/${p.id}`} className="text-gold font-bold hover:text-navy">
                              Detail →
                           </Button>
                        </td>
                      </tr>
                    ))
                 )}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  )
}

function LayoutDashboard({ className }: { className: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
}
