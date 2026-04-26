// ============================================================
// PropFS — Admin: Invoices Management
// ============================================================

import { useState, useEffect } from 'react'
import { Receipt, Search, Download, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      // Dummy fetch from the invoices table we defined in migration
      const { data } = await supabase
        .from('invoices')
        .select(`
          *,
          user:profiles ( full_name, email )
        `)
        .order('created_at', { ascending: false })
      
      if (data) setInvoices(data)
    }
    load()
  }, [])

  const filtered = invoices.filter(i => 
    i.invoice_number?.toLowerCase().includes(search.toLowerCase()) || 
    i.user?.email?.toLowerCase().includes(search.toLowerCase())
  )

  const StatusBadge = ({ status }: { status: string }) => {
    switch(status) {
      case 'paid': return <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase"><CheckCircle2 className="w-3 h-3"/> LUNAS</span>
      case 'pending': return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase"><Clock className="w-3 h-3"/> PENDING</span>
      default: return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold uppercase"><XCircle className="w-3 h-3"/> {status}</span>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-serif font-bold text-navy flex items-center gap-2">
              <Receipt className="h-6 w-6 text-gold" /> Data Invoice
           </h1>
           <p className="text-sm text-muted-foreground mt-1">Kelola dan pantau semua tagihan pelanggan SaaS.</p>
        </div>
      </div>

      <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border bg-slate-50 flex items-center gap-4">
           <div className="relative w-72">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
             <Input 
               placeholder="Cari No. Invoice / Email..." 
               className="pl-9 h-9"
               value={search} onChange={e => setSearch(e.target.value)}
             />
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">No. Invoice</th>
                <th className="px-5 py-3 font-medium">Pelanggan</th>
                <th className="px-5 py-3 font-medium">Paket</th>
                <th className="px-5 py-3 font-medium">Total (IDR)</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">Belum ada invoice</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4 font-mono font-bold text-navy">{inv.invoice_number}</td>
                  <td className="px-5 py-4">
                    <p className="font-bold">{inv.user?.full_name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{inv.user?.email || 'N/A'}</p>
                  </td>
                  <td className="px-5 py-4 uppercase text-xs font-bold tracking-wider text-muted-foreground">
                     {inv.plan_id}
                  </td>
                  <td className="px-5 py-4 font-bold">
                    Rp {inv.total_idr.toLocaleString('id-ID')}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => alert('Download format PDF...')}>
                      <Download className="w-3.5 h-3.5" /> PDF
                    </Button>
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
