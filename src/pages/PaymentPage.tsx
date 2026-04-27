import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, CreditCard, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { initiatePayment, openPaymentPopup, generateInvoicePDF, Invoice } from '@/lib/invoice'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import Header from '@/components/layout/Header'

export default function PaymentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'gopay'>('bank_transfer')

  useEffect(() => {
    if (id) fetchInvoice()
  }, [id])

  async function fetchInvoice() {
    setLoading(true)
    const localInv = localStorage.getItem(`propfs_invoice_${id}`)
    if (localInv) {
       setInvoice(JSON.parse(localInv) as Invoice)
    }
    setLoading(false)
  }

  async function handlePay() {
    if (!invoice || !user) return
    setIsProcessing(true)

    try {
      // In production, initiatePayment should ideally take the invoice ID and link it to Midtrans.
      // Since it requires plan_id and months right now, we derive months = 1 as default fallback
      const months = 1 
      const paymentRes = await initiatePayment(invoice.plan_id, months, invoice.id, invoice.total_idr)
      
      if (!paymentRes) throw new Error('Gagal memproses ke Midtrans.')

      await openPaymentPopup(
        paymentRes.snapToken,
        async () => {
          // onSuccess
          // Update Invoice in local storage
          const updatedInv = { ...invoice, status: 'paid', paid_at: new Date().toISOString() }
          localStorage.setItem(`propfs_invoice_${invoice.id}`, JSON.stringify(updatedInv))
          
          // Auto-provision actual Subscription in Supabase!
          await supabase.from('subscriptions').insert({
             user_id: user.id,
             plan_id: invoice.plan_id,
             status: 'active',
             started_at: new Date().toISOString(),
             // expired_at approx 30 days from now
             expired_at: new Date(Date.now() + 30 * 86400000).toISOString()
          })

          toast({ title: 'Pembayaran Berhasil! 🎉', description: `Invoice lunas dan paket telah diaktifkan.` })
          navigate('/home')
        },
        () => {
          toast({ title: 'Pembayaran Gagal', variant: 'destructive' })
          setIsProcessing(false)
        },
        () => {
          toast({ title: 'Menunggu Pembayaran' })
          navigate('/home')
        }
      )
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
      setIsProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center p-20">Loading...</div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="max-w-3xl mx-auto p-10 text-center">
          <h2 className="text-2xl font-bold">Invoice Tidak Ditemukan</h2>
          <Button className="mt-4" onClick={() => navigate('/home')}>Kembali ke Dashboard</Button>
        </div>
      </div>
    )
  }

  const isPaid = invoice.status === 'paid'

  return (
    <div className="min-h-screen bg-slate-50 text-navy pb-20">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 py-10 mt-10">
        <div className="mb-8">
          <Button variant="ghost" className="gap-2" onClick={() => navigate('/home')}>
            <ChevronLeft className="w-4 h-4" /> Kembali
          </Button>
        </div>

        <div className="text-center mb-10">
           <h1 className="text-4xl font-serif font-black text-navy mb-2">Pembayaran</h1>
           <div className="flex justify-center items-center">
              <div className="h-[2px] w-12 bg-border"></div>
              <CheckCircle2 className="w-5 h-5 mx-3 text-emerald-500" />
              <div className="h-[2px] w-12 bg-border"></div>
           </div>
        </div>

        <div className="space-y-10">
          {/* Invoice Detail Section */}
          <section>
            <h3 className="font-bold text-lg mb-4">Invoice Detail</h3>
            <div className="bg-white border border-border shadow-sm rounded-xl overflow-hidden text-sm">
              <div className="grid grid-cols-1 md:grid-cols-4 border-b border-border">
                <div className="bg-slate-50 p-4 font-bold md:col-span-1">Nomor Invoice</div>
                <div className="p-4 md:col-span-3 font-medium">{invoice.invoice_number}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 border-b border-border">
                <div className="bg-slate-50 p-4 font-bold md:col-span-1">Tanggal Invoice</div>
                <div className="p-4 md:col-span-3 font-medium">{new Date(invoice.created_at).toLocaleDateString('id-ID', { dateStyle: 'long' })}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 border-b border-border">
                <div className="bg-slate-50 p-4 font-bold md:col-span-1">Status Invoice</div>
                <div className="p-4 md:col-span-3">
                  <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {invoice.status}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4">
                <div className="bg-slate-50 p-4 font-bold md:col-span-1">Total Harga (Inc. PPN)</div>
                <div className="p-4 md:col-span-3 flex items-center gap-2">
                  <span className="font-black text-base">Rp {invoice.total_idr.toLocaleString('id-ID')}</span>
                  <span 
                    className="text-blue-600 hover:underline cursor-pointer text-xs"
                    onClick={() => generateInvoicePDF(invoice)}
                  >
                    (Lihat & Download Invoice)
                  </span>
                </div>
              </div>
            </div>
          </section>

          {!isPaid && (
            <>
              {/* Pembayaran Section */}
              <section>
                <h3 className="font-bold text-lg mb-4">Pembayaran</h3>
                <div className="bg-white border border-border rounded-xl overflow-hidden p-2">
                   <div className="flex items-center justify-between p-4 border-2 border-emerald-500 bg-emerald-50/30 rounded-lg cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold">Bayar Full Amount</span>
                      </div>
                      <span className="font-bold text-right">Rp {invoice.total_idr.toLocaleString('id-ID')}</span>
                   </div>
                </div>
              </section>

              {/* Payment Methods */}
              <section>
                <h3 className="font-bold text-lg mb-4">Pilih Metode Pembayaran</h3>
                <div className="bg-white border border-border rounded-xl p-4 space-y-4">
                  <div className="flex justify-between items-center py-2 px-4 bg-slate-50 rounded-lg border border-border">
                    <span className="font-bold text-sm">Sisa Total Bayar</span>
                    <span className="font-black text-lg">Rp {invoice.total_idr.toLocaleString('id-ID')}</span>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div 
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${paymentMethod === 'bank_transfer' ? 'border-navy bg-slate-50' : 'border-border hover:border-navy/30'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${paymentMethod === 'bank_transfer' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-transparent'}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">Bank Transfer / Virtual Account</span>
                          <span className="text-xs text-muted-foreground">Proses pengecekan otomatis via Midtrans</span>
                        </div>
                      </div>
                      <CreditCard className="w-6 h-6 text-slate-400" />
                    </div>

                    <div 
                      onClick={() => setPaymentMethod('gopay')}
                      className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${paymentMethod === 'gopay' ? 'border-navy bg-slate-50' : 'border-border hover:border-navy/30'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${paymentMethod === 'gopay' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-transparent'}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">GoPay / QRIS</span>
                          <span className="text-xs text-muted-foreground">Proses pengecekan otomatis via Midtrans</span>
                        </div>
                      </div>
                      <ShieldCheck className="w-6 h-6 text-slate-400" />
                    </div>
                  </div>

                  <Button 
                    className="w-full mt-6 h-14 text-lg font-black bg-navy hover:bg-navy/90 text-gold"
                    onClick={handlePay}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Memproses...' : 'Bayar'}
                  </Button>
                </div>
              </section>
            </>
          )}

        </div>
      </main>
    </div>
  )
}
