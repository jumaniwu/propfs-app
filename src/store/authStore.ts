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

export interface BankDetails {
  bankName: string
  accountNumber: string
  accountName: string
  whatsapp: string
}

export const DEFAULT_BANK_DETAILS: BankDetails = {
  bankName: 'BANK BCA',
  accountNumber: '8210 555 XXX',
  accountName: 'PT. PropFS Digital Indonesia',
  whatsapp: '08110000000',
}

// ── Store Interface ─────────────────────────────────────────
interface AuthStore {
  user: User | null
  session: Session | null
  profile: Profile | null
  subscription: Subscription | null
  isSubscriptionEnabled: boolean
  globalFeatures: Record<AppFeature, boolean>
  bankDetails: BankDetails
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

export const DEFAULT_LANDING_CONTENT: LandingPageContent = {
    branding: {
      logoUrl: '',
      siteName: 'PropFS',
      tagline: 'Feasibility Study & Cost Control System'
    },
    hero: {
      title: 'Analisa Kelayakan Proyek Properti Lebih Cepat',
      subtitle: 'Platform terintegrasi untuk menghitung cashflow, IRR, NPV hingga kontrol budget pembangunan dan Kurva S dalam satu dashboard.',
      hashtags: ['#DeveloperProperti', '#AnalisaKelayakan', '#CostControl'],
      imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2026&auto=format&fit=crop'
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
    },
    footer: {
      copyrightText: '© {year} PropFS. All rights reserved.',
      email: 'hello@propfs.id',
      phone: '+62 811 0000 000',
      address: 'Batam Centre, Kepulauan Riau',
      whatsappUrl: 'https://wa.me/628110000000'
    }
}

// ── Store ──────────────────────────────────────────────────
export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  subscription: null,
  isSubscriptionEnabled: false,
  globalFeatures: { fs_module: true, cost_control: true, cost_rab: true, cost_material: false, cost_realisasi: true, ai_solver: true, pdf_export: true, scurve: true, dashboard_admin: false },
  bankDetails: DEFAULT_BANK_DETAILS,
  isLoading: true,
  authError: null,
  landingContent: DEFAULT_LANDING_CONTENT,
  // ── initialize ────────────────────────────────────────────
  initialize: async () => {
    set({ isLoading: true })

    // Safety net: always release loading after 5s so page never hangs blank
    const safetyTimeout = setTimeout(() => {
      set({ isLoading: false })
    }, 5000)

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
      clearTimeout(safetyTimeout)
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

      // Try to create the profile row immediately
      // Use upsert to avoid duplicate key errors if profile already exists
      if (data.user) {
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: fullName,
            company,
            phone,
            role: 'user',
            total_projects_created: 0,
          }, { onConflict: 'id' })
        } catch (profileErr: any) {
          // Profile insert may fail due to RLS if email confirmation is required
          // This is OK — refreshProfile will self-heal when user eventually logs in
          console.warn('[SignUp] Profile insert deferred:', profileErr.message)
        }
      }

      // Check if email confirmation is required
      // When confirmation is required, data.session will be null
      if (data.user && !data.session) {
        throw new Error('Pendaftaran berhasil! Silakan cek email Anda untuk konfirmasi, lalu login kembali.')
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
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.error("SignOut error:", e)
    } finally {
      set({ user: null, session: null, profile: null, subscription: null })
    }
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
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        set({ profile: data as Profile })
      } else {
        // Fallback: If DB trigger failed, self-heal by creating the profile now.
        const meta = user.user_metadata || {}
        const newProfile = {
           id: user.id,
           full_name: meta.full_name || user.email?.split('@')[0] || 'Unknown',
           company: meta.company || '-',
           phone: meta.phone || '-',
           role: 'user',
           total_projects_created: 0
        }
        await supabase.from('profiles').insert(newProfile)
        set({ profile: newProfile as Profile })
      }
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
        .in('key', ['subscription_enabled', 'feature_flags', 'bank_details'])

      const subEnabled = data?.find(i => i.key === 'subscription_enabled')?.value
      const flags = data?.find(i => i.key === 'feature_flags')?.value
      const bankDetails = data?.find(i => i.key === 'bank_details')?.value

      set({
        isSubscriptionEnabled: subEnabled === true || subEnabled === 'true',
        globalFeatures: typeof flags === 'object' && flags !== null ? { ...get().globalFeatures, ...flags } : get().globalFeatures,
        bankDetails: typeof bankDetails === 'object' && bankDetails !== null ? bankDetails : get().bankDetails
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
        const v = data.value as any

        // Helper: only merge keys that have a truthy non-empty value from DB
        // This prevents blank DB values from wiping out defaults
        const safeMerge = (defaults: Record<string, any>, overrides: Record<string, any> = {}, section?: string) => {
          const result = { ...defaults }
          for (const key of Object.keys(overrides)) {
            let val = overrides[key]
            
            // Trim if it's a string
            if (typeof val === 'string') val = val.trim();

            // Special check: If hero content is just "PropFS" or too short, it's likely a placeholder/corrupted
            if (section === 'hero' && (key === 'title' || key === 'subtitle' || key === 'imageUrl')) {
               if (val === 'PropFS' || !val || (key !== 'imageUrl' && val.length < 10)) continue;
            }

            // Only override if value is non-empty
            if (val !== undefined && val !== null && val !== '') {
              result[key] = val
            }
          }
          return result
        }

        set(state => ({
          landingContent: {
            branding: safeMerge(state.landingContent.branding, v.branding) as typeof state.landingContent.branding,
            hero: safeMerge(state.landingContent.hero, v.hero, 'hero') as typeof state.landingContent.hero,
            suitableFor: safeMerge(state.landingContent.suitableFor, v.suitableFor) as typeof state.landingContent.suitableFor,
            features: Array.isArray(v.features) && v.features.length > 0 ? v.features : state.landingContent.features,
            auxiliaryProducts: Array.isArray(v.auxiliaryProducts) && v.auxiliaryProducts.length > 0 ? v.auxiliaryProducts : state.landingContent.auxiliaryProducts,
            marketingHighlight: safeMerge(state.landingContent.marketingHighlight, v.marketingHighlight) as typeof state.landingContent.marketingHighlight,
            footer: v.footer ? safeMerge(state.landingContent.footer, v.footer) as typeof state.landingContent.footer : state.landingContent.footer,
          }
        }))
      }
    } catch { /* ignore */ }
  },

  updateLandingContent: async (content: LandingPageContent) => {
    const fullContent = {
      ...get().landingContent,
      ...content
    }

    // Check if row exists first to avoid upsert issues with RLS
    const { data: existing } = await supabase
      .from('app_settings')
      .select('key')
      .eq('key', 'landing_page_cms')
      .maybeSingle()

    let error
    if (existing) {
      const { error: updateErr } = await supabase
        .from('app_settings')
        .update({ value: fullContent })
        .eq('key', 'landing_page_cms')
      error = updateErr
    } else {
      const { error: insertErr } = await supabase
        .from('app_settings')
        .insert({ key: 'landing_page_cms', value: fullContent })
      error = insertErr
    }

    if (error) {
      console.error('[authStore] updateLandingContent error:', error)
      throw error
    }
    
    // Force a reload from DB to ensure local state perfectly matches
    await get().loadLandingContent()
  },

  // ── clearError ────────────────────────────────────────────
  clearError: () => set({ authError: null }),

  // ── getCurrentPlan ────────────────────────────────────────
  getCurrentPlan: (): PlanId => {
    const { subscription, isSubscriptionEnabled } = get()
    if (!isSubscriptionEnabled) return 'free' // flag off = free tier display
    if (!subscription || subscription.status !== 'active') return 'free'
    return (subscription.plan_id as PlanId) || 'free'
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
    const { profile, globalFeatures } = get()

    // 1. Superadmin always has all features
    if (profile?.role === 'superadmin') return true

    // 2. Check per-user explicit override
    if (profile?.custom_features && profile.custom_features[feature] !== undefined) {
      return profile.custom_features[feature]
    }

    // Lock cost_control for free tier
    if (feature === 'cost_control' && get().getCurrentPlan() === 'free') {
      return false
    }

    // 3. Fallback to global system-wide setting
    return globalFeatures[feature] ?? false
  },
}))
