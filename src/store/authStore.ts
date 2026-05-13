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
  type LandingPageContent,
  type TrialInfo,
  type TrialFeatures,
  type TrialStatus
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
  bankName: '',
  accountNumber: '',
  accountName: '',
  whatsapp: '',
}

export interface PaymentSettings {
  enableMidtrans: boolean
  enableManual: boolean
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
  paymentSettings: PaymentSettings
  isPasswordRecovery: boolean
  isLoading: boolean
  authError: string | null
  landingContent: LandingPageContent
  trialInfo: TrialInfo | null
  trialFeatures: TrialFeatures | null

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, company: string, phone: string) => Promise<{ needsConfirmation: boolean }>
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

  getTrialInfo: () => TrialInfo
  isTrialActive: () => boolean
  isTrialExpired: () => boolean
  canAccessFeatureDuringTrial: (feature: string) => boolean
}

function computeTrialInfo(profile: Profile | null): TrialInfo {
  if (!profile) return {
    status: 'trial_active',
    startedAt: null,
    expiresAt: null,
    daysRemaining: 30,
    isExpired: false,
    isExtended: false,
  }

  // Jika sudah subscribe berbayar, trial tidak relevan
  const status = (profile.trial_status as TrialStatus) || 'trial_active'
  const expiresAt = profile.trial_expires_at 
    ? new Date(profile.trial_expires_at) 
    : null
  const startedAt = profile.trial_started_at
    ? new Date(profile.trial_started_at)
    : null

  const now = new Date()
  const isExpired = expiresAt ? expiresAt < now : false
  
  const daysRemaining = expiresAt && status !== 'free_forever'
    ? Math.max(0, Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ))
    : -1

  return {
    status: isExpired && status === 'trial_active' 
      ? 'trial_expired' 
      : status,
    startedAt,
    expiresAt,
    daysRemaining,
    isExpired,
    isExtended: profile.is_trial_extended || false,
  }
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
    },
    faq: {
      title: 'Pertanyaan yang Sering Ditanyakan',
      subtitle: 'Semua yang perlu Anda ketahui tentang PropFS',
      items: [
        {
          id: 'faq-1',
          question: 'Apa manfaat utama menggunakan PropFS dibanding cara manual?',
          answer: 'PropFS menghemat waktu Anda dari berminggu-minggu menjadi hitungan jam. Yang lebih penting, hasil analisisnya konsisten dan bebas human error. Developer yang menggunakan PropFS bisa mengambil keputusan investasi lebih cepat, lebih percaya diri, dan dengan data yang jauh lebih solid dibanding mengandalkan feeling atau spreadsheet buatan sendiri.',
        },
        {
          id: 'faq-2',
          question: 'Siapa yang paling diuntungkan dengan menggunakan PropFS?',
          answer: 'PropFS paling dirasakan manfaatnya oleh empat tipe pengguna: (1) Developer properti yang ingin tahu apakah proyek mereka benar-benar menguntungkan sebelum mulai bangun, (2) Investor yang ingin memvalidasi tawaran kerjasama lahan sebelum menanam modal, (3) Konsultan properti yang butuh alat bantu membuat laporan FS profesional untuk klien, dan (4) Pemilik lahan yang ingin tahu potensi maksimal lahannya jika dikembangkan.',
        },
        {
          id: 'faq-3',
          question: 'Apa yang bisa saya ketahui dari hasil analisis PropFS?',
          answer: 'Dari satu proyek yang diinput, PropFS menghasilkan: proyeksi keuntungan bersih, titik balik modal (breakeven), Net Present Value (NPV), Internal Rate of Return (IRR), simulasi cashflow bulanan, analisis sensitivitas terhadap perubahan harga atau biaya, hingga perhitungan bagi hasil dengan investor. Semua informasi yang Anda butuhkan untuk memutuskan apakah proyek layak dilanjutkan atau tidak.',
        },
        {
          id: 'faq-4',
          question: 'Bagaimana PropFS membantu saya terlihat lebih profesional di depan investor?',
          answer: 'Laporan PDF yang dihasilkan PropFS tampil dengan format standar keuangan yang rapi, lengkap dengan grafik cashflow, tabel proyeksi, dan analisis risiko. Ketika Anda presentasi ke investor atau bank dengan laporan seperti ini, Anda langsung terlihat serius dan terukur — bukan sekadar developer yang mengandalkan estimasi kasar. Kepercayaan investor dimulai dari data yang bisa dipertanggungjawabkan.',
        },
        {
          id: 'faq-5',
          question: 'Apakah PropFS bisa membantu saya menghindari kerugian proyek?',
          answer: 'Inilah tujuan utama PropFS. Banyak developer merugi bukan karena proyeknya buruk, tapi karena tidak punya gambaran cashflow yang akurat sejak awal — kehabisan modal di tengah pembangunan, salah menghitung biaya, atau terlalu optimis dengan harga jual. PropFS memaksa Anda melihat angka yang realistis sebelum satu pun bata dipasang, termasuk simulasi skenario terburuk jika harga jual turun atau biaya membangun naik.',
        },
        {
          id: 'faq-6',
          question: 'Apakah PropFS cocok untuk proyek skala kecil seperti 10-20 unit rumah?',
          answer: 'Justru proyek skala kecil yang paling membutuhkan analisis yang cermat — margin kesalahannya lebih tipis dan modalnya lebih terbatas. PropFS sama efektifnya untuk proyek 10 unit perumahan sederhana maupun proyek ratusan unit mixed-use. Tidak ada minimum skala proyek. Yang penting adalah Anda tahu angkanya sebelum mulai.',
        },
        {
          id: 'faq-7',
          question: 'Apa tujuan jangka panjang PropFS untuk industri properti Indonesia?',
          answer: 'Kami percaya bahwa industri properti Indonesia yang lebih sehat dimulai dari keputusan investasi yang lebih cerdas. Terlalu banyak proyek gagal di tengah jalan karena perencanaan keuangan yang lemah. PropFS hadir untuk mendemokratisasi akses terhadap analisis kelayakan properti yang selama ini hanya bisa dilakukan oleh konsultan mahal atau developer besar. Dengan PropFS, developer kecil pun bisa bersaing dengan perencanaan yang sama profesionalnya.',
        },
        {
          id: 'faq-8',
          question: 'Apakah hasil analisis PropFS bisa saya jadikan pegangan untuk negosiasi harga lahan?',
          answer: 'Sangat bisa. Salah satu penggunaan paling powerful dari PropFS adalah saat negosiasi harga lahan. Dengan memasukkan berbagai skenario harga lahan, Anda bisa langsung melihat di harga berapa proyek masih layak dan di harga berapa sudah tidak masuk akal secara finansial. Ini memberi Anda posisi negosiasi yang jauh lebih kuat karena berbasis angka, bukan feeling.',
        },
      ]
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
  paymentSettings: { enableMidtrans: true, enableManual: true },
  isPasswordRecovery: false,
  isLoading: true,
  authError: null,
  landingContent: DEFAULT_LANDING_CONTENT,
  trialInfo: null,
  trialFeatures: null,
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

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          set({ isPasswordRecovery: true })
          return
        }
        // Don't update user state if there's no session
        // (e.g. signUp with email confirmation pending fires SIGNED_IN but session is null)
        if (!session) {
          set({ user: null, session: null, profile: null, subscription: null })
          return
        }
        set({ user: session.user, session })
        if (session.user) {
          await Promise.all([get().refreshProfile(), get().refreshSubscription()])
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
            email: email,
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
      const needsConfirmation = !!(data.user && !data.session)
      return { needsConfirmation }
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
        const trialInfo = computeTrialInfo(data as Profile)
        set({ trialInfo })
        
        // Jika trial sudah expired, update ke DB
        if (trialInfo.isExpired && data.trial_status === 'trial_active') {
          await supabase
            .from('profiles')
            .update({ trial_status: 'trial_expired' })
            .eq('id', user.id)
        }
      } else {
        // Fallback: If DB trigger failed, self-heal by creating the profile now.
        const meta = user.user_metadata || {}
        const newProfile = {
           id: user.id,
           full_name: meta.full_name || user.email?.split('@')[0] || 'Unknown',
           company: meta.company || '-',
           phone: meta.phone || '-',
           email: user.email || '',
           role: 'user',
           total_projects_created: 0
        }
        await supabase.from('profiles').insert(newProfile)
        set({ profile: newProfile as Profile })
        const trialInfo = computeTrialInfo(newProfile as Profile)
        set({ trialInfo })
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
        .in('key', ['subscription_enabled', 'feature_flags', 'bank_details', 'trial_features', 'payment_settings'])

      const subEnabled = data?.find(i => i.key === 'subscription_enabled')?.value
      const flags = data?.find(i => i.key === 'feature_flags')?.value
      const bankDetails = data?.find(i => i.key === 'bank_details')?.value
      const trialFeaturesData = data?.find(i => i.key === 'trial_features')?.value
      const paymentSettingsData = data?.find(i => i.key === 'payment_settings')?.value

      set({
        isSubscriptionEnabled: subEnabled === true || subEnabled === 'true',
        globalFeatures: typeof flags === 'object' && flags !== null ? { ...get().globalFeatures, ...flags } : get().globalFeatures,
        bankDetails: typeof bankDetails === 'object' && bankDetails !== null ? bankDetails : get().bankDetails,
        paymentSettings: typeof paymentSettingsData === 'object' && paymentSettingsData !== null ? { ...get().paymentSettings, ...(paymentSettingsData as object) } : get().paymentSettings
      })

      if (trialFeaturesData && typeof trialFeaturesData === 'object') {
        const tf = trialFeaturesData as any
        set({
          trialFeatures: {
            maxProjects: tf.max_projects || 3,
            canExportPDF: tf.can_export_pdf || false,
            canAccessCashflow: tf.can_access_cashflow || false,
            canUseAiParser: tf.can_use_ai_parser || false,
            aiParserLimit: tf.ai_parser_limit || 0,
            canExportExcel: tf.can_export_excel || false,
            description: tf.description || '',
          }
        })
      }
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
        
        // Simple merge: Start with defaults, overwrite with anything from DB
        set(state => {
          const content = state.landingContent;
          const branding = { ...content.branding, ...(v.branding || {}) };
          
          // Hero logic: If DB title is just 'PropFS' or empty, keep the professional default title
          let hero = { ...content.hero, ...(v.hero || {}) };
          if (!v.hero?.title || v.hero.title === 'PropFS') {
            hero.title = content.hero.title;
            hero.subtitle = content.hero.subtitle;
            hero.imageUrl = content.hero.imageUrl;
          }

          return {
            landingContent: {
              branding,
              hero,
              suitableFor: { ...content.suitableFor, ...(v.suitableFor || {}) },
              features: Array.isArray(v.features) && v.features.length > 0 ? v.features : content.features,
              auxiliaryProducts: Array.isArray(v.auxiliaryProducts) && v.auxiliaryProducts.length > 0 ? v.auxiliaryProducts : content.auxiliaryProducts,
              marketingHighlight: { ...content.marketingHighlight, ...(v.marketingHighlight || {}) },
              footer: { ...content.footer, ...(v.footer || {}) },
              faq: {
                ...content.faq,
                ...(v.faq || {}),
                items: Array.isArray(v.faqItems) ? v.faqItems : (v.faq?.items || content.faq.items)
              }
            }
          };
        })
      }
    } catch (err) {
      console.error('[authStore] loadLandingContent error:', err)
    }
  },

  updateLandingContent: async (content: LandingPageContent) => {
    // Save directly to DB without complex local merging
    // This ensures what the user sees in the CMS is what gets saved
    const { data: existing } = await supabase
      .from('app_settings')
      .select('key')
      .eq('key', 'landing_page_cms')
      .maybeSingle()

    let error
    let affectedRows = 0

    if (existing) {
      const { data, error: updateErr } = await supabase
        .from('app_settings')
        .update({ value: content })
        .eq('key', 'landing_page_cms')
        .select()
      error = updateErr
      affectedRows = data ? data.length : 0
    } else {
      const { data, error: insertErr } = await supabase
        .from('app_settings')
        .insert({ key: 'landing_page_cms', value: content })
        .select()
      error = insertErr
      affectedRows = data ? data.length : 0
    }

    if (error) {
      console.error('[authStore] updateLandingContent error:', error)
      throw error
    }

    if (affectedRows === 0) {
      console.error('[authStore] updateLandingContent silent failure: 0 rows affected. Check RLS or Schema Cache.')
      throw new Error('Gagal menyimpan ke database. Sinkronisasi terblokir oleh sistem keamanan (RLS) atau Schema Cache belum di-reload.')
    }
    
    // Update local state and reload from DB to confirm
    set({ landingContent: content })
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
    
    const plan = get().getCurrentPlan()
    const limits = PLAN_LIMITS[plan]

    // ALWAYS enforce free plan permanent slot limit (total_projects_created)
    // regardless of whether the subscription system is enabled globally.
    // This prevents free users from creating unlimited projects.
    if (limits.projectSlotPermanent) {
      return (profile?.total_projects_created ?? 0) < limits.maxProjects
    }

    // For paid plans: only enforce active project count limit when subscription is enabled
    if (!isSubscriptionEnabled) return true
    return activeProjectCount < limits.maxProjects
  },

  // ── isFeatureEnabled ──────────────────────────────────────
  isFeatureEnabled: (feature: AppFeature): boolean => {
    const { profile, globalFeatures } = get()

    // 1. Superadmin always has all features
    if (profile?.role === 'superadmin') return true

    // 2. Check per-user explicit override (only for granting access, not revoking)
    if (profile?.custom_features && profile.custom_features[feature] === true) {
      return true
    }

    // Lock cost_control for free tier
    if (feature === 'cost_control' && get().getCurrentPlan() === 'free') {
      return false
    }

    // 3. Fallback to global system-wide setting
    return globalFeatures[feature] ?? false
  },

  // ── Trial Methods ─────────────────────────────────────────
  getTrialInfo: () => {
    const { profile, subscription } = get()
    if (subscription?.status === 'active') {
      return {
        status: 'free_forever' as TrialStatus,
        startedAt: null,
        expiresAt: null,
        daysRemaining: -1,
        isExpired: false,
        isExtended: false,
      }
    }
    return computeTrialInfo(profile)
  },

  isTrialActive: () => {
    const { subscription } = get()
    if (subscription?.status === 'active') return true
    const trial = get().getTrialInfo()
    return trial.status === 'trial_active' && !trial.isExpired
  },

  isTrialExpired: () => {
    const { subscription } = get()
    if (subscription?.status === 'active') return false
    const trial = get().getTrialInfo()
    return trial.isExpired || trial.status === 'trial_expired'
  },

  canAccessFeatureDuringTrial: (feature: string) => {
    const { trialFeatures, subscription } = get()
    if (subscription?.status === 'active') return true
    if (!trialFeatures) return false
    const trial = get().getTrialInfo()
    if (trial.status === 'free_forever') return false
    if (trial.isExpired) return false
    return !!(trialFeatures as any)[feature]
  },
}))
