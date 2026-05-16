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
    getPlanLimits
  } = useAuthStore()

  const plan   = getCurrentPlan()
  const limits = getPlanLimits(plan) as typeof PLAN_LIMITS[typeof plan] & {
    maxFsProjects: number
    maxCostProjects: number
  }

  const addonFsSlots   = (profile as any)?.addon_fs_slots   ?? 0
  const addonCostSlots = (profile as any)?.addon_cost_slots ?? 0

  const maxFsProjects   = (limits.maxFsProjects   ?? limits.maxProjects)  + addonFsSlots
  const maxCostProjects = (limits.maxCostProjects  ?? 0)                  + addonCostSlots

  return {
    // Current state
    currentPlan:            plan,
    isSubscriptionEnabled,
    subscription,

    // Feature gates
    canExportPDF:           limits.canExportPDF,
    canAccessCashflow:      limits.canAccessCashflow,
    canAccessARAP:          limits.canAccessARAP,
    // maxProjects kept for compatibility, now reflects FS limit from catalog
    maxProjects:            maxFsProjects,
    maxFsProjects,
    maxCostProjects,
    projectSlotPermanent:   limits.projectSlotPermanent,

    // Project limit helper (pass active project count)
    canCreateProject,

    // For free plan: show how many slots remain (FS)
    freeProjectsUsed:       profile?.total_projects_created ?? 0,
    freeProjectsRemaining:  Math.max(0, maxFsProjects - (profile?.total_projects_created ?? 0)),

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
