// ============================================================
// PropFS — PlanBadge Component
// ============================================================

import { useSubscription } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
  size?: 'sm' | 'md'
}

const BADGE_STYLES = {
  free:  'bg-muted text-muted-foreground border-muted-foreground/30',
  basic: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400',
  pro:   'bg-gold/10 text-gold border-gold/30',
}

export default function PlanBadge({ className, size = 'sm' }: Props) {
  const { planLabel, currentPlan, isSubscriptionEnabled } = useSubscription()

  if (!isSubscriptionEnabled) return null

  return (
    <span
      className={cn(
        'inline-flex items-center border rounded-full font-semibold tabular-nums',
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
        BADGE_STYLES[currentPlan],
        className
      )}
    >
      {planLabel}
    </span>
  )
}
