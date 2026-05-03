// ── Auth Route Guards ────────────────────────────────────
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { AppFeature } from '@/lib/supabase'

interface Props { children: React.ReactNode }
interface FeatureProps { children: React.ReactNode; feature: AppFeature }

function Spinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/** Redirect to /auth if not logged in */
export function PrivateRoute({ children }: Props) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

/** Redirect to /home if already logged in (used for Login/Register pages) */
export function AuthRoute({ children }: Props) {
  const { user, isLoading } = useAuthStore()
  const urlParams = new URLSearchParams(window.location.search)
  const planParam = urlParams.get('plan')
  const redirectTo = planParam && planParam !== 'free' ? `/home?create_invoice=${planParam}` : '/home'

  if (isLoading) return null
  if (user) return <Navigate to={redirectTo} replace />
  return <>{children}</>
}

/** Open Route — always renders, no redirect, no loading block */
export function OpenRoute({ children }: Props) {
  // Do NOT block on isLoading — landing page should always render immediately
  return <>{children}</>
}

/** Redirect non-superadmin away from admin routes */
export function AdminRoute({ children }: Props) {
  const { user, profile, isLoading } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!user || profile?.role !== 'superadmin') return <Navigate to="/home" replace />
  return <>{children}</>
}

/** Block access to feature-gated routes for users without the feature.
 *  Superadmin always passes through. Free users are redirected to /home. */
export function FeatureRoute({ children, feature }: FeatureProps) {
  const { user, isLoading, isFeatureEnabled } = useAuthStore()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/auth" replace />
  if (!isFeatureEnabled(feature)) {
    return <Navigate to="/home" replace state={{ upgradeNeeded: feature }} />
  }
  return <>{children}</>
}
