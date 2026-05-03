// ============================================================
// PropFS — Admin: Invoices Management
// ============================================================

import { useState, useEffect } from 'react'
import { Receipt, Search, Download, CheckCircle2, XCircle, Clock, RefreshCw, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { generateInvoicePDF, type Invoice } from '@/lib/invoice'

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'failed'>('all')

  useEffect(() => {
    loadInvoices()
  }, [])

  async function loadInvoices() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          profiles:user_id ( id, full_name, company, phone )
        `)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.warn('[AdminInvoices] Query error:', error.message)
      }
      if (data) setInvoices(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleMarkAsPaid(inv: any) {
    const confirmPay = confirm(`Konfirmasi manual pembayaran untuk ${inv.invoice_number}?\nPaket ${inv.plan_id} akan otomatis aktif untuk user ini.`)
    if (!confirmPay) return

    setLoading(true)
    try {
      const now = new Date().toISOString()
      
      // 1. Update Invoice
      const { error: invErr } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at: now, payment_method: 'manual_verification' })
        .eq('id', inv.id)
      
      if (invErr) throw invErr

      // 2. Activate Subscription
      const durationMonths = 1 // Default to 1 month for manual
      const expiry = new Date()
      expiry.setMonth(expiry.getMonth() + durationMonths)

      const { error: subErr } = await supabase
        .from('subscriptions')
        .insert({
          user_id: inv.user_id,
          plan_id: inv.plan_id,
          status: 'active',
          started_at: now,
          expired_at: expiry.toISOString()
        })
      
      if (subErr) throw subErr

      toast({ title: 'Invoice Berhasil Dilunasi', description: 'Paket user telah diaktifkan secara manual.' })
      loadInvoices()
    } catch (err: any) {
      toast({ title: 'Gagal memproses', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const filtered = invoices.filter(i => {
    const matchesSearch = !search || 
      i.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      i.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.profiles?.company?.toLowerCase().includes(search.toLowerCase()) ||
      i.plan_id?.toLowerCase().includes(search.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || i.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const statusCounts = {
    all: invoices.length,
    pending: invoices.filter(i => i.status === 'pending').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    failed: invoices.filter(i => !['pending', 'paid'].includes(i.status)).length,
  }

  const StatusBadge = ({ status }: { status: string }) => {
    switch(status) {
      case 'paid': return <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase"><CheckCircle2 className="w-3 h-3"/> LUNAS</span>
      case 'pending': return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase"><Clock className="w-3 h-3"/> PENDING</span>
      case 'expired': return <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold uppercase"><XCircle className="w-3 h-3"/> EXPIRED</span>
      default: return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase"><XCircle className="w-3 h-3"/> {status?.toUpperCase()}</span>
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const planNames: Record<string, string> = {
    starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise', free: 'Free Trial'
  }

  // Summary stats
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total_idr || 0), 0)
  const pendingRevenue = invoices.filter(i => i.status === 'pending').reduce((sum, i) => sum + (i.total_idr || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-serif font-bold text-navy flex items-center gap-2">
              <Receipt className="h-6 w-6 text-gold" /> Data Invoice
           </h1>
           <p className="text-sm text-muted-foreground mt-1">Kelola dan pantau semua tagihan pelanggan SaaS.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={loadInvoices} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Revenue Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Revenue (Lunas)</p>
          <p className="text-2xl font-black text-emerald-700">Rp {totalRevenue.toLocaleString('id-ID')}</p>
          <p className="text-xs text-emerald-600 mt-1">{statusCounts.paid} invoice lunas</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Pending</p>
          <p className="text-2xl font-black text-amber-700">Rp {pendingRevenue.toLocaleString('id-ID')}</p>
          <p className="text-xs text-amber-600 mt-1">{statusCounts.pending} invoice menunggu</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Total Invoice</p>
          <p className="text-2xl font-black text-navy">{statusCounts.all}</p>
          <p className="text-xs text-slate-500 mt-1">{statusCounts.failed > 0 ? `${statusCounts.failed} gagal/expired` : 'Semua berjalan baik'}</p>
        </div>
      </div>

      <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center gap-4">
           <div className="relative w-72">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
             <Input 
               placeholder="Cari No. Invoice / Nama / Perusahaan..." 
               className="pl-9 h-9"
               value={search} onChange={e => setSearch(e.target.value)}
             />
           </div>
           
           {/* Status filter tabs */}
           <div className="flex gap-1 bg-muted rounded-xl p-1">
             {(['all', 'pending', 'paid', 'failed'] as const).map(s => (
               <button 
                 key={s}
                 onClick={() => setStatusFilter(s)}
                 className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? 'bg-white text-navy shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
               >
                 {s === 'all' ? 'Semua' : s === 'pending' ? 'Pending' : s === 'paid' ? 'Lunas' : 'Gagal'}
                 <span className="ml-1 opacity-60">({statusCounts[s]})</span>
               </button>
             ))}
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">No. Invoice</th>
                <th className="px-5 py-3 font-medium">Pelanggan</th>
                <th className="px-5 py-3 font-medium">Paket</th>
                <th className="px-5 py-3 font-medium text-right">Total (IDR)</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Tanggal</th>
                <th className="px-5 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center p-8 text-muted-foreground italic">
                  <RefreshCw className="h-5 w-5 animate-spin inline mr-2" /> Memuat invoice...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">
                  {search || statusFilter !== 'all' ? 'Tidak ada invoice yang cocok dengan filter.' : 'Belum ada invoice.'}
                </td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4 font-mono font-bold text-navy text-xs">{inv.invoice_number}</td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-sm">{inv.profiles?.full_name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{inv.profiles?.company || '-'}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy/5 text-navy text-xs font-bold uppercase tracking-wider">
                      {planNames[inv.plan_id] || inv.plan_id}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold text-right tabular-nums">
                    Rp {(inv.total_idr || 0).toLocaleString('id-ID')}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    <div>Dibuat: {formatDate(inv.created_at)}</div>
                    {inv.paid_at && <div className="text-emerald-600 font-medium">Lunas: {formatDate(inv.paid_at)}</div>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      {inv.status === 'pending' && (
                        <Button variant="outline" size="sm" className="h-8 gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleMarkAsPaid(inv)}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Konfirmasi
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => {
                        if (inv) generateInvoicePDF(inv as Invoice)
                      }}>
                        <Download className="w-3.5 h-3.5" /> PDF
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
