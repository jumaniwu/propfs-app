// ============================================================
// PropFS — Auth Store (Zustand)
// ============================================================

import { create } from 'zustand'
import {
  supabase,
  type Profile,
  type Subscription,
  type PlanId,
  type AppFeature,
  type LandingPageContent
} from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'


// ── Plan feature definitions (mirrored from DB) ────────────
export const PLAN_LIMITS: Record<PlanId, {
  maxProjects: number
  canExportPDF: boolean
  canAccessCashflow: boolean
  canAccessARAP: boolean
  projectSlotPermanent: boolean
}> = {
  free: { maxProjects: 2, canExportPDF: false, canAccessCashflow: false, canAccessARAP: false, projectSlotPermanent: true },
  basic: { maxProjects: 5, canExportPDF: true, canAccessCashflow: false, canAccessARAP: false, projectSlotPermanent: false },
  pro: { maxProjects: 10, canExportPDF: true, canAccessCashflow: true, canAccessARAP: true, projectSlotPermanent: false },
}

// ── Store Interface ─────────────────────────────────────────
interface AuthStore {
  user: User | null
  session: Session | null
  profile: Profile | null
  subscription: Subscription | null
  isSubscriptionEnabled: boolean
  globalFeatures: Record<AppFeature, boolean>
  isLoading: boolean
  authError: string | null
  landingContent: LandingPageContent

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, company: string, phone: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshProfile: () => Promise<void>
  refreshSubscription: () => Promise<void>
  loadFeatureFlags: () => Promise<void>
  loadLandingContent: () => Promise<void>
  updateLandingContent: (content: LandingPageContent) => Promise<void>
  clearError: () => void
  getCurrentPlan: () => PlanId
  canCreateProject: (activeProjectCount: number) => boolean
  isFeatureEnabled: (feature: AppFeature) => boolean
}

// ── Store ──────────────────────────────────────────────────
export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  subscription: null,
  isSubscriptionEnabled: false,
  globalFeatures: { fs_module: true, cost_control: true, cost_rab: true, cost_material: false, cost_realisasi: true, ai_solver: true, pdf_export: true, scurve: true, dashboard_admin: false },
  isLoading: true,
  authError: null,
  landingContent: {
    branding: {
      logoUrl: '',
      siteName: 'PropFS',
      tagline: 'Feasibility Study & Cost Control System'
    },
    hero: {
      title: 'Analisa Kelayakan Proyek Properti Lebih Cepat',
      subtitle: 'Platform terintegrasi untuk menghitung cashflow, IRR, NPV hingga kontrol budget pembangunan dan Kurva S dalam satu dashboard.',
      hashtags: ['#DeveloperProperti', '#AnalisaKelayakan', '#CostControl'],
      imageUrl: 'https://images.unsplash.com/photo-1460472178825-e5240623abe5?q=80&w=2070&auto=format&fit=crop'
    },
    suitableFor: {
      label: 'SOLUSI TERBAIK UNTUK :',
      tags: ['Developer Perumahan', 'Kontraktor', 'Investor Properti', 'Management Project']
    },
    features: [
      { id: '1', title: 'Feasibility Study', desc: 'Analisa kelayakan finansial mendetail (IRR, NPV, ROI).', iconName: 'Calculator' },
      { id: '2', title: 'Cost Control', desc: 'Pelacakan budget RAB vs Realisasi proyek.', iconName: 'BarChart' },
      { id: '3', title: 'Kurva S Otomatis', desc: 'Visualisasi progres fisik dan finansial proyek.', iconName: 'TrendingUp' },
      { id: '4', title: 'Laporan PDF', desc: 'Ekspor laporan profesional siap cetak.', iconName: 'FileText' },
    ],
    auxiliaryProducts: [
      { id: 'a1', title: 'AI Profit Solver', desc: 'Optimasi harga jual otomatis berbasis AI.', iconName: 'Sparkles' },
      { id: 'a2', title: 'Manajemen User', desc: 'Akses hirarki untuk tim internal.', iconName: 'Users' }
    ],
    marketingHighlight: {
      title: 'Digitalkan Analisa Properti Anda Secara Profesional',
      desc: 'Tinggalkan spreadsheet yang rumit dan mulailah menggunakan sistem yang terstandarisasi untuk meminimalkan risiko investasi.',
      imageUrl: 'https://images.unsplash.com/photo-1554232456-8727aae0cfa4?q=80&w=2070&auto=format&fit=crop'
    }
  },

  // ── initialize ────────────────────────────────────────────
  initialize: async () => {
    set({ isLoading: true })


    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        set({ user: session.user, session })
        await Promise.all([
          get().refreshProfile(),
          get().refreshSubscription(),
        ])
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ user: session?.user ?? null, session })
        if (session?.user) {
          await Promise.all([get().refreshProfile(), get().refreshSubscription()])
        } else {
          set({ profile: null, subscription: null })
        }
      })
    } catch {
      // Silently ignore connection errors
    } finally {
      set({ isLoading: false })
    }

    // Load feature flags & landing content regardless of auth state
    try {
      await Promise.all([
        get().loadFeatureFlags(),
        get().loadLandingContent()
      ])
    } catch { /* ignore */ }
  },

  // ── signIn ────────────────────────────────────────────────
  signIn: async (email, password) => {
    set({ isLoading: true, authError: null })


    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err: any) {
      set({ authError: err.message || 'Gagal login. Periksa email dan password.' })
      throw err
    } finally {
      set({ isLoading: false })
    }
  },

  // ── signUp ────────────────────────────────────────────────
  signUp: async (email, password, fullName, company, phone) => {
    set({ isLoading: true, authError: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, company, phone } },
      })
      if (error) throw error
      if (data.user) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          full_name: fullName,
          company,
          phone,
          role: 'user',
          total_projects_created: 0,
        })
      }
    } catch (err: any) {
      set({ authError: err.message || 'Gagal mendaftar. Coba lagi.' })
      throw err
    } finally {
      set({ isLoading: false })
    }
  },

  // ── signOut ───────────────────────────────────────────────
  signOut: async () => {
    localStorage.removeItem(MOCK_STORAGE_KEY)
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null, subscription: null })
  },

  // ── resetPassword ─────────────────────────────────────────
  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },

  // ── refreshProfile ────────────────────────────────────────
  refreshProfile: async () => {
    const { user } = get()
    if (!user) return
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) set({ profile: data as Profile })
    } catch { /* ignore */ }
  },

  // ── refreshSubscription ───────────────────────────────────
  refreshSubscription: async () => {
    const { user } = get()
    if (!user) return
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      set({ subscription: data as Subscription | null })
    } catch { /* ignore */ }
  },

  // ── loadFeatureFlags ──────────────────────────────────────
  loadFeatureFlags: async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['subscription_enabled', 'feature_flags'])

      const subEnabled = data?.find(i => i.key === 'subscription_enabled')?.value
      const flags = data?.find(i => i.key === 'feature_flags')?.value

      set({
        isSubscriptionEnabled: subEnabled === true || subEnabled === 'true',
        globalFeatures: typeof flags === 'object' && flags !== null ? { ...get().globalFeatures, ...flags } : get().globalFeatures
      })
    } catch {
      // DB not available — keep defaults
      set({ isSubscriptionEnabled: false })
    }
  },
  // ── handle Landing Content ───────────────────────────────
  loadLandingContent: async () => {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'landing_page_cms').maybeSingle()
      if (data?.value && typeof data.value === 'object') {
        set(state => ({
          landingContent: {
            ...state.landingContent,
            ...(data.value as Partial<LandingPageContent>)
          }
        }))
      }
    } catch { /* ignore */ }
  },

  updateLandingContent: async (content: LandingPageContent) => {
    // Pastikan kita menyimpan state penuh agar array features tidak hilang
    const fullContent = {
      ...get().landingContent,
      ...content
    }

    const { error } = await supabase
      .from('app_settings')
      .update({ value: fullContent, updated_at: new Date().toISOString() })
      .eq('key', 'landing_page_cms')

    if (error) throw error
    set({ landingContent: fullContent })
  },

  // ── clearError ────────────────────────────────────────────
  clearError: () => set({ authError: null }),

  // ── getCurrentPlan ────────────────────────────────────────
  getCurrentPlan: (): PlanId => {
    const { subscription, isSubscriptionEnabled } = get()
    if (!isSubscriptionEnabled) return 'pro' // flag off = full access
    if (!subscription || subscription.status !== 'active') return 'free'
    return subscription.plan_id
  },

  // ── canCreateProject ──────────────────────────────────────
  canCreateProject: (activeProjectCount: number): boolean => {
    const { profile, isSubscriptionEnabled } = get()
    if (!isSubscriptionEnabled) return true

    const plan = get().getCurrentPlan()
    const limits = PLAN_LIMITS[plan]

    if (limits.projectSlotPermanent) {
      return (profile?.total_projects_created ?? 0) < limits.maxProjects
    }
    return activeProjectCount < limits.maxProjects
  },

  // ── isFeatureEnabled ──────────────────────────────────────
  isFeatureEnabled: (feature: AppFeature): boolean => {
    const { profile, globalFeatures, user } = get()

    // 1. Superadmin always has all features
    if (profile?.role === 'superadmin') return true

    // 2. Check per-user explicit override
    if (profile?.custom_features && profile.custom_features[feature] !== undefined) {
      return profile.custom_features[feature]
    }

    // 3. Fallback to global system-wide setting
    return globalFeatures[feature] ?? false
  },
}))
