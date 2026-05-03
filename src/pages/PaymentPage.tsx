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
  const { user, bankDetails } = useAuthStore()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'gopay' | 'manual'>('bank_transfer')

  useEffect(() => {
    if (id) fetchInvoice()
  }, [id])

  async function fetchInvoice() {
    setLoading(true)
    try {
      // Try fetching from Supabase DB first
      if (id && !id.startsWith('local_')) {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        
        if (data && !error) {
          setInvoice(data as Invoice)
          setLoading(false)
          return
        }
      }

      // Fallback to localStorage
      const localInv = localStorage.getItem(`propfs_invoice_${id}`)
      if (localInv) {
        setInvoice(JSON.parse(localInv) as Invoice)
      }
    } catch (e) {
      console.error('[PaymentPage] Error loading invoice:', e)
      // Final fallback to localStorage
      const localInv = localStorage.getItem(`propfs_invoice_${id}`)
      if (localInv) setInvoice(JSON.parse(localInv) as Invoice)
    }
    setLoading(false)
  }

  async function handlePay() {
    if (!invoice || !user) return
    setIsProcessing(true)

    try {
      const months = 1 
      const paymentRes = await initiatePayment(invoice.plan_id, months, invoice.id, invoice.total_idr)
      
      if (!paymentRes) throw new Error('Gagal memproses ke Midtrans.')

      await openPaymentPopup(
        paymentRes.snapToken,
        async () => {
          // onSuccess — update invoice status in DB
          const now = new Date().toISOString()
          
          // Update Supabase
          if (invoice.id && !invoice.id.startsWith('local_')) {
            await supabase
              .from('invoices')
              .update({ status: 'paid', paid_at: now, payment_method: 'midtrans' })
              .eq('id', invoice.id)
          }

          // Update localStorage cache
          const updatedInv = { ...invoice, status: 'paid' as const, paid_at: now }
          localStorage.setItem(`propfs_invoice_${invoice.id}`, JSON.stringify(updatedInv))
          
          // Auto-provision subscription
          await supabase.from('subscriptions').insert({
             user_id: user.id,
             plan_id: invoice.plan_id,
             status: 'active',
             started_at: now,
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
          toast({ title: 'Menunggu Pembayaran', description: 'Status invoice: PENDING. Kami akan memperbarui otomatis setelah pembayaran dikonfirmasi.' })
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

                    <div 
                      onClick={() => setPaymentMethod('manual')}
                      className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${paymentMethod === 'manual' ? 'border-navy bg-slate-50' : 'border-border hover:border-navy/30'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${paymentMethod === 'manual' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-transparent'}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">Transfer Bank Manual (Verifikasi Admin)</span>
                          <span className="text-xs text-muted-foreground">Gunakan ini jika pembayaran otomatis bermasalah</span>
                        </div>
                      </div>
                      <Receipt className="w-6 h-6 text-slate-400" />
                    </div>
                  </div>

                  {paymentMethod === 'manual' && (
                    <div className="mt-6 p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2">
                       <p className="text-sm font-bold text-navy">Instruksi Transfer Manual:</p>
                       <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs text-slate-500 uppercase tracking-widest font-black">Transfer Ke Rekening:</p>
                          <div className="flex justify-between items-center">
                             <span className="font-bold">{bankDetails?.bankName || 'BANK BCA'}</span>
                             <span className="font-mono font-black text-lg">{bankDetails?.accountNumber || '8210 555 XXX'}</span>
                          </div>
                          <p className="text-sm font-medium">A/N {bankDetails?.accountName || 'PT. PropFS Digital Indonesia'}</p>
                       </div>
                       <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                          <li>Transfer tepat sesuai nominal: <strong>Rp {invoice.total_idr.toLocaleString('id-ID')}</strong></li>
                          <li>Kirim bukti transfer ke WhatsApp: <strong>{bankDetails?.whatsapp || '08110000000'}</strong></li>
                          <li>Lampirkan nomor invoice: <strong>{invoice.invoice_number}</strong></li>
                          <li>Admin akan memverifikasi dalam 1-2 jam kerja.</li>
                       </ul>
                    </div>
                  )}

                  <Button 
                    className="w-full mt-6 h-14 text-lg font-black bg-navy hover:bg-navy/90 text-gold"
                    onClick={() => {
                      if (paymentMethod === 'manual') {
                         const cleanWa = (bankDetails?.whatsapp || '628110000000').replace(/\D/g, '')
                         const waNumber = cleanWa.startsWith('0') ? '62' + cleanWa.slice(1) : cleanWa
                         window.open(`https://wa.me/${waNumber}?text=Halo%20Admin%2C%20saya%20sudah%20transfer%20untuk%20invoice%20${invoice.invoice_number}.%20Mohon%20verifikasinya.`, '_blank')
                      } else {
                         handlePay()
                      }
                    }}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Memproses...' : paymentMethod === 'manual' ? 'Konfirmasi via WhatsApp' : 'Bayar'}
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
