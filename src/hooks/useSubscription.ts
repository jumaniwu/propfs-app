// ============================================================
// PropFS — useSubscription Hook
// ============================================================

import { useAuthStore, PLAN_LIMITS } from '@/store/authStore'

export function useSubscription() {
  const {
    subscription,
    isSubscriptionEnabled,
    profile,
    getCurrentPlan,
    canCreateProject,
  } = useAuthStore()

  const plan   = getCurrentPlan()
  const limits = PLAN_LIMITS[plan]

  return {
    // Current state
    currentPlan:            plan,
    isSubscriptionEnabled,
    subscription,

    // Feature gates
    canExportPDF:           limits.canExportPDF,
    canAccessCashflow:      limits.canAccessCashflow,
    canAccessARAP:          limits.canAccessARAP,
    maxProjects:            limits.maxProjects,
    projectSlotPermanent:   limits.projectSlotPermanent,

    // Project limit helper (pass active project count)
    canCreateProject,

    // For free plan: show how many slots remain
    freeProjectsUsed:       profile?.total_projects_created ?? 0,
    freeProjectsRemaining:  Math.max(0, 2 - (profile?.total_projects_created ?? 0)),

    // Upgrade needed checks
    needsUpgradeForCashflow: isSubscriptionEnabled && !limits.canAccessCashflow,
    needsUpgradeForPDF:      isSubscriptionEnabled && !limits.canExportPDF,
    needsUpgradeForProject:  (activeCount: number) =>
      isSubscriptionEnabled && !canCreateProject(activeCount),

    // Plan labels
    planLabel: {
      free:  'Free',
      basic: 'Basic',
      pro:   'Pro',
    }[plan] as string,

    planColor: {
      free:  'text-muted-foreground',
      basic: 'text-blue-600',
      pro:   'text-gold',
    }[plan] as string,
  }
}
