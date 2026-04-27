// ============================================================
// PropFS — Pricing Page (Revamped)
// Pilihan paket + durasi (1/3/12 bln) + PPN from admin
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, ArrowLeft, Crown, Zap, Star,
  Sparkles, Clock, Calendar, CalendarDays
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Header from '@/components/layout/Header'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { usePPNRate } from '@/hooks/usePPNRate'

// ── Duration Options ─────────────────────────────────────────
const DURATIONS = [
  { months: 1,  label: '1 Bulan',   icon: Clock,        discount: 0,   badge: '' },
  { months: 3,  label: '3 Bulan',   icon: Calendar,     discount: 10,  badge: 'HEMAT 10%' },
  { months: 12, label: '12 Bulan',  icon: CalendarDays, discount: 20,  badge: 'HEMAT 20%' },
]

// ── Plan Definitions ─────────────────────────────────────────
interface Plan {
  id: string
  name: string
  icon: React.ElementType
  pricePerMonth: number
  color: string
  highlight: boolean
  badge?: string
  features: { label: string; included: boolean }[]
  cta: string
}

const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free Trial', icon: Star, pricePerMonth: 0,
    color: 'text-slate-500', highlight: false, cta: 'Mulai Gratis',
    features: [
      { label: '2 proyek Feasibility Study',      included: true  },
      { label: 'Kalkulator NPV, IRR, ROI dasar',  included: true  },
      { label: 'Ekspor ringkasan teks',            included: true  },
      { label: '1 user',                          included: true  },
      { label: 'Cost Control & RAB',               included: false },
      { label: 'AI Chat Realisasi Biaya',          included: false },
      { label: 'Upload & parsing RAB Excel (AI)', included: false },
      { label: 'Material Schedule otomatis',       included: false },
      { label: 'Kurva S Progres',                 included: false },
      { label: 'Ekspor laporan Excel/PDF',         included: false },
    ],
  },
  {
    id: 'starter', name: 'Starter', icon: Zap, pricePerMonth: 149_000,
    color: 'text-blue-600', highlight: false, cta: 'Pilih Starter',
    features: [
      { label: '5 proyek Feasibility Study',      included: true  },
      { label: 'Cost Control & RAB (1 proyek)',    included: true  },
      { label: 'Upload RAB Excel (AI parsing)',    included: true  },
      { label: 'Material Schedule otomatis',       included: true  },
      { label: 'Kurva S progress proyek',          included: true  },
      { label: 'Ekspor laporan Excel',             included: true  },
      { label: 'AI Chat Realisasi (50 pesan/bln)', included: true  },
      { label: '1 user',                          included: true  },
      { label: 'Ekspor PDF branded',               included: false },
      { label: 'Multi-user / tim',                included: false },
    ],
  },
  {
    id: 'pro', name: 'Pro', icon: Crown, pricePerMonth: 399_000,
    color: 'text-amber-600', highlight: true, badge: '🔥 POPULER', cta: 'Berlangganan Pro',
    features: [
      { label: 'Feasibility Study tak terbatas',   included: true  },
      { label: 'Cost Control & RAB tak terbatas',  included: true  },
      { label: 'AI Chat Realisasi tanpa batas',    included: true  },
      { label: 'Upload RAB + validasi AI otomatis',included: true  },
      { label: 'Material Schedule + Kurva S',      included: true  },
      { label: 'Laporan Excel & PDF branded',      included: true  },
      { label: 'Realisasi Biaya (Material+Upah)',  included: true  },
      { label: 'Up to 3 user / tim',              included: true  },
      { label: 'Prioritas support via WA',         included: true  },
    ],
  },
  {
    id: 'enterprise', name: 'Enterprise', icon: Sparkles, pricePerMonth: 999_000,
    color: 'text-purple-600', highlight: false, cta: 'Hubungi Sales',
    features: [
      { label: 'Semua fitur Pro',                 included: true  },
      { label: 'User & proyek tak terbatas',       included: true  },
      { label: 'AI prioritas (Gemini+Claude)',     included: true  },
      { label: 'White-label PDF perusahaan',       included: true  },
      { label: 'Akses API (integrasi ERP)',         included: true  },
      { label: 'Dashboard admin & audit log',      included: true  },
      { label: 'Onboarding & training tim',        included: true  },
      { label: 'Dedicated support 24 jam',         included: true  },
      { label: 'SLA Uptime 99.9%',                included: true  },
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────
function calcPrice(base: number, months: number, discountPct: number) {
  const total = base * months
  return Math.round(total * (1 - discountPct / 100))
}

function rp(n: number) { return `Rp ${n.toLocaleString('id-ID')}` }

// ── COMPONENT ────────────────────────────────────────────────
export default function PricingPage() {
  const navigate   = useNavigate()
  const { getCurrentPlan } = useAuthStore()
  const { ppnPct, loading: ppnLoading } = usePPNRate()
  const currentPlan = getCurrentPlan()

  const [selectedMonths, setSelectedMonths] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
  const dur = DURATIONS.find(d => d.months === selectedMonths)!

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-12 space-y-10">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="font-serif text-3xl lg:text-4xl font-bold text-foreground">
            Pilih Paket PropFS
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Mulai gratis, upgrade kapan saja. Semua harga <strong>belum termasuk PPN{ppnLoading ? '' : ` ${ppnPct}%`}</strong>.
          </p>
        </div>

        {/* Duration Selector */}
        <div className="flex justify-center">
          <div className="inline-flex bg-muted rounded-2xl p-1.5 gap-1">
            {DURATIONS.map(d => {
              const DIcon = d.icon
              const isActive = selectedMonths === d.months
              return (
                <button
                  key={d.months}
                  onClick={() => setSelectedMonths(d.months)}
                  className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                    ${isActive ? 'bg-navy text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <DIcon className="h-4 w-4" />
                  {d.label}
                  {d.badge && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-gold text-navy' : 'bg-green-500 text-white'}`}>
                      {d.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Duration info bar */}
        {dur.discount > 0 && (
          <div className="text-center">
            <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-4 py-1.5 text-sm font-bold">
              🎁 Hemat {dur.discount}% dengan paket {dur.label} — bayar sekarang, aktif langsung {dur.months} bulan
            </span>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {PLANS.map(plan => {
            const PIcon = plan.icon
            const isCurrentPlan = plan.id === currentPlan
            const totalPrice = calcPrice(plan.pricePerMonth, selectedMonths, dur.discount)
            const ppnAmount  = Math.round(totalPrice * (ppnPct / 100))
            const grandTotal = totalPrice + ppnAmount
            const isFree     = plan.pricePerMonth === 0

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-[28px] border-2 p-7 transition-all duration-300
                  ${plan.highlight
                    ? 'border-gold bg-navy text-white shadow-2xl shadow-gold/20 scale-[1.02]'
                    : 'border-border bg-card hover:border-gold/30 hover:shadow-lg'
                  }`}
              >
                {/* Popular badge */}
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gold text-navy text-[10px] font-black px-3 py-1.5 rounded-full whitespace-nowrap">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Current plan indicator */}
                {isCurrentPlan && (
                  <div className="absolute -top-4 right-4">
                    <span className="bg-emerald-500 text-white text-[10px] font-black px-3 py-1.5 rounded-full">
                      ✓ Paket Aktif
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <div className={`flex items-center gap-2 mb-3 ${plan.highlight ? 'text-gold' : plan.color}`}>
                    <PIcon className="h-5 w-5" />
                    <span className="text-xs font-black uppercase tracking-widest">{plan.name}</span>
                  </div>

                  {isFree ? (
                    <div>
                      <p className={`font-serif text-4xl font-black ${plan.highlight ? 'text-white' : 'text-foreground'}`}>
                        Gratis
                      </p>
                      <p className={`text-xs mt-1 ${plan.highlight ? 'text-white/50' : 'text-muted-foreground'}`}>
                        Selamanya
                      </p>
                    </div>
                  ) : (
                    <div>
                      {dur.discount > 0 && (
                        <p className={`text-sm line-through ${plan.highlight ? 'text-white/40' : 'text-muted-foreground/60'}`}>
                          {rp(plan.pricePerMonth * selectedMonths)}
                        </p>
                      )}
                      <p className={`font-serif text-3xl font-black ${plan.highlight ? 'text-white' : 'text-foreground'}`}>
                        {rp(totalPrice)}
                      </p>
                      <p className={`text-xs mt-0.5 ${plan.highlight ? 'text-white/60' : 'text-muted-foreground'}`}>
                        untuk {dur.months} bulan{dur.discount > 0 ? ` (hemat ${dur.discount}%)` : ''}
                      </p>
                      <div className={`text-xs mt-2 pt-2 border-t ${plan.highlight ? 'border-white/10 text-white/50' : 'border-border text-muted-foreground'}`}>
                        <div className="flex justify-between">
                          <span>Subtotal</span>
                          <span>{rp(totalPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>PPN {ppnLoading ? '...' : `${ppnPct}%`}</span>
                          <span>+ {rp(ppnAmount)}</span>
                        </div>
                        <div className={`flex justify-between font-bold pt-1 ${plan.highlight ? 'text-gold' : 'text-foreground'}`}>
                          <span>Total Bayar</span>
                          <span>{rp(grandTotal)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map(f => (
                    <li key={f.label} className="flex items-start gap-2.5 text-sm">
                      {f.included
                        ? <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${plan.highlight ? 'text-gold' : 'text-emerald-600'}`} />
                        : <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/30" />
                      }
                      <span className={
                        f.included
                          ? (plan.highlight ? 'text-white' : 'text-foreground')
                          : 'text-muted-foreground/40 line-through'
                      }>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  variant={plan.highlight ? 'gold' : 'outline'}
                  className={`w-full h-11 font-bold mt-auto
                    ${plan.highlight ? '' : 'border-current'}
                    ${isCurrentPlan ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={isCurrentPlan || isProcessing}
                  onClick={async () => {
                    if (isFree) { navigate('/auth'); return }
                    if (plan.id === 'enterprise') { window.location.href = 'mailto:hello@propfs.id'; return }
                    
                    setIsProcessing(true)
                    try {
                      const { data: { user } } = await supabase.auth.getUser()
                      if (!user) { navigate('/auth'); return }

                      const invoiceId = `mock_inv_${Math.random().toString(36).substr(2,9)}`
                      const invoice = {
                         id: invoiceId,
                         user_id: user.id,
                         plan_id: plan.id,
                         invoice_number: `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*10000)}`,
                         period_start: new Date().toISOString(),
                         period_end: new Date(Date.now() + selectedMonths * 30 * 86400000).toISOString(),
                         subtotal_idr: totalPrice,
                         ppn_idr: ppnAmount,
                         total_idr: grandTotal,
                         status: 'pending',
                         created_at: new Date().toISOString()
                      }
                      
                      localStorage.setItem(`propfs_invoice_${invoiceId}`, JSON.stringify(invoice))
                      navigate(`/payment/${invoiceId}`)
                    } catch (e) {
                      console.error(e)
                    } finally {
                      setIsProcessing(false)
                    }
                  }}
                >
                  {isCurrentPlan ? '✓ Paket Aktif' : isProcessing ? 'Memproses...' : plan.cta}
                </Button>
              </div>
            )
          })}
        </div>

        {/* PPN Note */}
        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>
            * Harga belum termasuk PPN {ppnLoading ? '...' : `${ppnPct}%`} sesuai peraturan perpajakan yang berlaku.
          </p>
          <p>
            Pembayaran via QRIS, Transfer Bank, GoPay, OVO, & Kartu Kredit.{' '}
            Hubungi <span className="text-gold font-medium">hello@propfs.id</span> untuk langganan Enterprise.
          </p>
          <p className="text-xs">
            Diskon 10% untuk 3 bulan — Diskon 20% untuk 12 bulan. Paket berbayar bisa dibatalkan kapan saja.
          </p>
        </div>
      </main>
    </div>
  )
}
