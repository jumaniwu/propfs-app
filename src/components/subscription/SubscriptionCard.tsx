// ============================================================
// PropFS — Subscription Status Card
// Tampilkan status langganan, sisa hari, dan daftar invoice
// ============================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CreditCard, CalendarDays, AlertTriangle, CheckCircle2,
  ChevronRight, Download, RefreshCw, Crown, Zap, Star, Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/invoice'

// ── Plan Metadata ────────────────────────────────────────────
const PLAN_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; border: string }> = {
  free:       { label: 'Free Trial', color: 'text-slate-500',  bg: 'bg-slate-100',  border: 'border-slate-200', icon: <Star className="w-4 h-4" /> },
  starter:    { label: 'Starter',    color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200',  icon: <Zap className="w-4 h-4" /> },
  pro:        { label: 'Pro',        color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200', icon: <Crown className="w-4 h-4" /> },
  enterprise: { label: 'Enterprise', color: 'text-purple-600', bg: 'bg-purple-50',  border: 'border-purple-200',icon: <Sparkles className="w-4 h-4" /> },
}

// ── Invoice type (local mock until Supabase ready) ─────────
interface Invoice {
  id: string
  invoice_number: string
  plan_id: string
  period_start: string
  period_end: string
  total_idr: number
  status: 'paid' | 'pending' | 'failed'
  created_at: string
}

// ── Status chip ───────────────────────────────────────────
function StatusChip({ status }: { status: Invoice['status'] }) {
  const cfg = {
    paid:    { label: 'Lunas',    cls: 'bg-emerald-100 text-emerald-700' },
    pending: { label: 'Menunggu', cls: 'bg-amber-100 text-amber-700' },
    failed:  { label: 'Gagal',    cls: 'bg-red-100 text-red-700' },
  }[status]
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
}

// ── Progress bar sisa hari ────────────────────────────────
function DaysProgress({ expiresAt, startedAt }: { expiresAt: string; startedAt?: string }) {
  const now = Date.now()
  const end = new Date(expiresAt).getTime()
  const start = startedAt ? new Date(startedAt).getTime() : end - 30 * 86400000
  const totalDays = Math.round((end - start) / 86400000)
  const daysLeft = Math.max(0, Math.round((end - now) / 86400000))
  const pct = Math.max(0, Math.min(100, (daysLeft / totalDays) * 100))
  const isUrgent = daysLeft <= 7

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Sisa masa aktif</span>
        <span className={`font-bold ${isUrgent ? 'text-red-600' : 'text-foreground'}`}>
          {daysLeft === 0 ? 'Expired hari ini' : `${daysLeft} hari lagi`}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${
            isUrgent ? 'bg-red-500' : pct > 40 ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ──────────────────────────────────────────
interface Props {
  variant?: 'compact' | 'full'  // compact = portal homepage, full = profile page
}

export default function SubscriptionCard({ variant = 'compact' }: Props) {
  const navigate = useNavigate()
  const { subscription, getCurrentPlan } = useAuthStore()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(variant === 'full')

  const planId = getCurrentPlan()
  const meta = PLAN_META[planId] ?? PLAN_META.free

  useEffect(() => {
    if (variant === 'full') loadInvoices()
  }, [variant])

  async function loadInvoices() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)
      if (data) setInvoices(data as Invoice[])
    } catch {
      // Jika table belum ada, tampilkan empty state
    } finally {
      setLoading(false)
    }
  }

  const expiresAt = subscription?.expires_at
  const isActive  = subscription?.status === 'active'
  const daysLeft  = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : null
  const isUrgent  = daysLeft !== null && daysLeft <= 7

  // ── COMPACT (Portal Homepage) ───────────────────────────
  if (variant === 'compact') {
    return (
      <div className={`bg-white shadow-sm border rounded-3xl p-6 space-y-4 ${isUrgent ? 'border-red-400 bg-red-50/50' : 'border-border'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gold" />
            <h4 className="text-sm font-bold text-navy">Langganan Aktif</h4>
          </div>
          {isUrgent && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-2.5 h-2.5" /> Segera Perpanjang
            </span>
          )}
        </div>

        {/* Plan badge */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl self-start w-fit ${meta.bg} ${meta.border} border`}>
          <span className={meta.color}>{meta.icon}</span>
          <span className={`text-sm font-black ${meta.color}`}>{meta.label}</span>
          {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        </div>

        {/* Dates */}
        {expiresAt ? (
          <div className="space-y-3">
            <DaysProgress expiresAt={expiresAt} startedAt={subscription?.created_at} />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5" />
              Aktif hingga {new Date(expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        ) : planId === 'free' ? (
          <p className="text-xs text-muted-foreground italic">Tidak ada tanggal kadaluarsa — upgrade untuk akses penuh</p>
        ) : null}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {planId === 'free' || planId === 'starter' ? (
            <Button size="sm" className="text-xs h-8 bg-gold text-navy font-bold hover:bg-gold/90 gap-1" onClick={() => navigate('/pricing')}>
              <Crown className="w-3 h-3" /> Upgrade
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="text-xs h-8 border-border text-foreground hover:bg-slate-50 gap-1" onClick={() => navigate('/profile')}>
              <RefreshCw className="w-3 h-3" /> Perpanjang
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-xs h-8 text-muted-foreground hover:text-foreground gap-1" onClick={() => navigate('/profile')}>
            Lihat Invoice <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    )
  }

  // ── FULL (Profile Page) ─────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Subscription Status Card */}
      <div className={`bg-card border rounded-2xl p-6 space-y-5 ${isUrgent ? 'border-red-400/50 bg-red-50/50' : 'border-border'}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Status Langganan
          </h2>
          {isUrgent && (
            <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-full">
              <AlertTriangle className="w-3.5 h-3.5" /> Berakhir {daysLeft} hari lagi!
            </span>
          )}
        </div>

        {/* Plan Info */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${meta.bg} ${meta.border} w-fit`}>
            <span className={meta.color}>{meta.icon}</span>
            <div>
              <p className={`font-black text-base ${meta.color}`}>{meta.label}</p>
              <p className="text-xs text-muted-foreground">{isActive ? 'Aktif' : 'Tidak aktif'}</p>
            </div>
          </div>

          {expiresAt && (
            <div className="flex-1 space-y-2">
              <DaysProgress expiresAt={expiresAt} startedAt={subscription?.created_at} />
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Aktif hingga <strong>{new Date(expiresAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {planId !== 'enterprise' && (
            <Button variant="gold" size="sm" className="gap-2" onClick={() => navigate('/pricing')}>
              <Crown className="h-3.5 w-3.5" />
              {planId === 'free' ? 'Upgrade Paket' : 'Upgrade / Perpanjang'}
            </Button>
          )}
          {expiresAt && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/pricing')}>
              <RefreshCw className="h-3.5 w-3.5" /> Perpanjang Langganan
            </Button>
          )}
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Riwayat Invoice</h2>
          <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={loadInvoices}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Belum ada riwayat invoice.</p>
            <p className="text-xs mt-1">Invoice akan muncul setelah pembayaran berhasil.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map(inv => (
              <div key={inv.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-bold">{inv.invoice_number}</p>
                    <StatusChip status={inv.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {PLAN_META[inv.plan_id]?.label ?? inv.plan_id} ·{' '}
                    {new Date(inv.period_start).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })} –{' '}
                    {new Date(inv.period_end).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dibuat: {new Date(inv.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-sm">Rp {inv.total_idr.toLocaleString('id-ID')}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => generateInvoicePDF(inv)}
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
