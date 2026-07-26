// ============================================================
// Ringkasan langganan PER PRODUK — Feasibility Study dan Kontraktor AI
// dilanggan terpisah, jadi statusnya ditampilkan berdampingan.
// ============================================================
import { useNavigate } from 'react-router-dom'
import { Calculator, BarChart3, CheckCircle2, CalendarDays, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { PRODUK, sisaHari, type Produk } from '@/lib/produk'

const IKON: Record<Produk, React.ComponentType<{ className?: string }>> = {
  feasibility: Calculator,
  kontraktor: BarChart3,
}

const NAMA_PAKET: Record<string, string> = {
  free: 'Gratis', basic: 'Basic', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
}

export default function ProdukLanggananCard() {
  const navigate = useNavigate()
  const { getPlanFor, getSubscriptionFor, isSubscriptionEnabled } = useAuthStore()

  if (!isSubscriptionEnabled) return null

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-base">Langganan Anda</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Feasibility Study dan Kontraktor AI adalah dua langganan terpisah — Anda bisa berlangganan
          salah satu saja, atau keduanya.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {PRODUK.map(p => {
          const Ikon = IKON[p.key]
          const plan = getPlanFor(p.key)
          const sub = getSubscriptionFor(p.key)
          const aktif = plan !== 'free' && !!sub
          const hari = sub ? sisaHari(sub) : null
          const mendesak = hari !== null && hari <= 7

          return (
            <div key={p.key}
              className={`rounded-xl border p-4 space-y-3 ${aktif ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-muted/20'}`}>
              <div className="flex items-start gap-2.5">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  aktif ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                  <Ikon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{p.nama}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{p.deskripsi}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`font-black px-2 py-0.5 rounded-full text-[10px] uppercase ${
                  aktif ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'}`}>
                  {NAMA_PAKET[plan] ?? plan}
                </span>
                {aktif ? (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                  </span>
                ) : (
                  <span className="text-muted-foreground">Belum berlangganan</span>
                )}
              </div>

              {hari !== null && (
                <p className={`text-[11px] flex items-center gap-1 ${mendesak ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}>
                  <CalendarDays className="w-3.5 h-3.5" />
                  {hari > 0 ? `Sisa ${hari} hari` : `Berakhir ${Math.abs(hari)} hari lalu`}
                </p>
              )}

              <Button size="sm" variant={aktif ? 'outline' : 'default'}
                className={`w-full h-8 text-xs gap-1.5 ${aktif ? '' : 'bg-navy hover:bg-navy/90 font-bold'}`}
                onClick={() => navigate(`/pricing?produk=${p.key}`)}>
                {aktif ? 'Perpanjang / Ubah Paket' : 'Mulai Berlangganan'}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
