// ============================================================
// PropFS — SubscriptionGate
// Wraps features that require a specific plan.
// When subscription_enabled = false → renders children always (no gate).
// ============================================================

import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSubscription } from '@/hooks/useSubscription'
import { Button } from '@/components/ui/button'
import type { PlanId } from '@/lib/supabase'

interface Props {
  requiredPlan: PlanId       // 'basic' | 'pro'
  feature:      string       // human-readable feature name shown in upgrade prompt
  children:     React.ReactNode
  /** If true, shows a blurred overlay instead of replacing. Default: false */
  overlay?:     boolean
}

const PLAN_ORDER: Record<PlanId, number> = { free: 0, basic: 1, pro: 2 }

export default function SubscriptionGate({ requiredPlan, feature, children, overlay = false }: Props) {
  const navigate = useNavigate()
  const { currentPlan, isSubscriptionEnabled } = useSubscription()

  // Feature flag off — let everything through
  if (!isSubscriptionEnabled) return <>{children}</>

  // User has enough plan access
  if (PLAN_ORDER[currentPlan] >= PLAN_ORDER[requiredPlan]) return <>{children}</>

  // Needs upgrade
  const UpgradePrompt = (
    <div className="flex flex-col items-center justify-center gap-4 py-10 px-6 text-center">
      <div className="w-14 h-14 bg-gold/10 rounded-2xl flex items-center justify-center">
        <Lock className="h-7 w-7 text-gold" />
      </div>
      <div>
        <h3 className="font-serif font-semibold text-base text-foreground">
          {feature} membutuhkan Plan {requiredPlan === 'basic' ? 'Basic' : 'Pro'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          {requiredPlan === 'pro'
            ? 'Upgrade ke Pro untuk akses Cashflow, AR, AP, dan semua fitur analisa lanjutan.'
            : 'Upgrade ke Basic untuk export PDF dan akses fitur lebih lengkap.'}
        </p>
      </div>
      <Button variant="gold" size="sm" onClick={() => navigate('/pricing')} className="gap-2">
        Lihat Paket & Harga →
      </Button>
    </div>
  )

  if (overlay) {
    return (
      <div className="relative">
        <div className="opacity-30 pointer-events-none select-none blur-[2px]">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl">
          {UpgradePrompt}
        </div>
      </div>
    )
  }

  return UpgradePrompt
}
