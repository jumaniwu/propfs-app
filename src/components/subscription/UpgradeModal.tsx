// ============================================================
// PropFS — Upgrade / Payment Modal
// ============================================================

import { useState, useEffect } from 'react'
import {
  X, CheckCircle2, ChevronRight, Zap, Crown, CreditCard, RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { usePPNRate } from '@/hooks/usePPNRate'
import { calculateInvoice, initiatePayment, openPaymentPopup } from '@/lib/invoice'
import { toast } from '@/hooks/use-toast'

interface Props {
  planId: 'starter' | 'pro'
  initialMonths?: number
  onClose: () => void
  onSuccess?: () => void
}

const DURATIONS = [
  { months: 1,  label: '1 Bulan',  discount: 0 },
  { months: 3,  label: '3 Bulan',  discount: 10, badge: 'HEMAT 10%' },
  { months: 12, label: '12 Bulan', discount: 20, badge: 'HEMAT 20%' },
]

export default function UpgradeModal({ planId, initialMonths = 1, onClose, onSuccess }: Props) {
  const { user } = useAuthStore()
  const { ppnPct, loading: ppnLoading } = usePPNRate()
  
  const [months, setMonths] = useState(initialMonths)
  const [loading, setLoading] = useState(false)
  const [invoiceCalc, setInvoiceCalc] = useState<{ subtotal: number, ppn: number, total: number } | null>(null)

  useEffect(() => {
    calculateInvoice(planId, months).then(res => setInvoiceCalc(res))
  }, [planId, months])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-3xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="p-6 pb-0 flex items-start justify-between">
          <div>
            <h2 className="font-serif font-bold text-2xl flex items-center gap-2 text-foreground">
              {planId === 'pro' ? <Crown className="w-6 h-6 text-gold" /> : <Zap className="w-6 h-6 text-blue-500" />}
              Berlangganan Paket {planId === 'pro' ? 'Pro' : 'Starter'}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">Pilih durasi dan selesaikan pembayaran.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Duration Selector */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Durasi Langganan</label>
            <div className="grid grid-cols-3 gap-3">
              {DURATIONS.map(d => {
                const isActive = months === d.months
                return (
                  <button
                    key={d.months}
                    onClick={() => {
                        setMonths(d.months);
                        calculateInvoice(planId, d.months).then(res => setInvoiceCalc(res))
                    }}
                    className={`relative p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all
                      ${isActive ? 'border-gold bg-gold/10 text-navy dark:text-gold shadow-md' : 'border-border hover:border-gold/30 hover:bg-muted'}`}
                  >
                    <span className="font-bold">{d.label}</span>
                    {d.badge && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-gold text-navy' : 'bg-green-100 text-green-700'}`}>
                        {d.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="bg-muted rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Paket {planId === 'pro' ? 'Pro' : 'Starter'} ({months} bulan)</span>
              <span>{invoiceCalc ? `Rp ${invoiceCalc.subtotal.toLocaleString('id-ID')}` : '...'}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground border-b border-border/50 pb-3">
              <span>PPN ({ppnLoading ? '...' : `${ppnPct}%`})</span>
              <span>{invoiceCalc ? `Rp ${invoiceCalc.ppn.toLocaleString('id-ID')}` : '...'}</span>
            </div>
            <div className="flex justify-between text-lg font-black text-foreground pt-1">
              <span>Total Tagihan</span>
              <span className="text-gold">{invoiceCalc ? `Rp ${invoiceCalc.total.toLocaleString('id-ID')}` : '...'}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 p-4 rounded-xl text-xs space-y-1">
            <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Langganan akan aktif setelah pembayaran berhasil.</p>
            <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> Tersedia metode QRIS, Transfer Bank, GoPay & CC.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          <Button 
            className="w-full h-12 text-base font-bold gap-2 bg-navy text-gold hover:bg-navy/90"
            disabled={loading || !invoiceCalc || !user}
            onClick={async () => {
              if (!user) {
                toast({ title: 'Silakan login terlebih dahulu.', variant: 'destructive' })
                return
              }
              setLoading(true)
              try {
                // 1. Initiate backend
                const paymentRes = await initiatePayment(planId, months)
                if (!paymentRes) throw new Error('Gagal memproses ke Midtrans.')

                // 2. Open Midtrans
                await openPaymentPopup(
                  paymentRes.snapToken,
                  () => {
                    toast({ title: 'Pembayaran Berhasil! 🎉', description: `Paket ${planId} sudah aktif.` })
                    onSuccess?.()
                    onClose()
                  },
                  (err) => {
                    toast({ title: 'Pembayaran Gagal', description: 'Silakan coba lagi.', variant: 'destructive' })
                    setLoading(false)
                  },
                  () => {
                    toast({ title: 'Pembayaran Pending', description: 'Silakan selesaikan pembayaran di Midtrans.' })
                    onClose()
                  }
                )
              } catch (e: any) {
                toast({ title: 'Error', description: e.message || 'Terjadi kesalahan tidak terduga', variant: 'destructive' })
                setLoading(false)
              }
            }}
          >
            {loading ? <><RefreshCw className="w-5 h-5 animate-spin" /> Memproses...</> : 'Bayar Sekarang'}
          </Button>
        </div>
      </div>
    </div>
  )
}
