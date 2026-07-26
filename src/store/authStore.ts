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
import {
  langgananProduk, planProduk, produkDariFitur, produkDariJenisProyek,
  type Produk,
} from '../lib/produk'
import { normalisasiPaket } from '../lib/planCatalog'


// ── Plan feature definitions (mirrored from DB) ────────────
export const PLAN_LIMITS: Record<PlanId, {
  maxProjects: number
  maxFsProjects: number
  maxCostProjects: number
  canExportPDF: boolean
  canAccessCashflow: boolean
  canAccessARAP: boolean
  projectSlotPermanent: boolean
}> = {
  free: { maxProjects: 2, maxFsProjects: 2, maxCostProjects: 0, canExportPDF: false, canAccessCashflow: false, canAccessARAP: false, projectSlotPermanent: true },
  basic: { maxProjects: 5, maxFsProjects: 5, maxCostProjects: 1, canExportPDF: true, canAccessCashflow: false, canAccessARAP: false, projectSlotPermanent: false },
  pro: { maxProjects: 10, maxFsProjects: 999, maxCostProjects: 999, canExportPDF: true, canAccessCashflow: true, canAccessARAP: true, projectSlotPermanent: false },
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
  /** Semua langganan aktif — satu per produk (Feasibility / Kontraktor AI). */
  subscriptions: Subscription[]
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
  planCatalog: any[]
  // Add-on feature flags
  addonFeaturesEnabled: boolean
  addonFsPrice: number
  addonCostPrice: number
  isAffiliateEnabled: boolean

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, company: string, phone: string, referralCode?: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshProfile: () => Promise<void>
  refreshSubscription: () => Promise<void>
  loadFeatureFlags: () => Promise<void>
  loadLandingContent: () => Promise<void>
  updateLandingContent: (content: LandingPageContent) => Promise<void>
  clearError: () => void
  getCurrentPlan: () => PlanId
  getPlanLimits: (plan: PlanId) => typeof PLAN_LIMITS[PlanId]
  canCreateProject: (activeProjectCount: number, addonType?: 'fs' | 'cost') => boolean
  isFeatureEnabled: (feature: AppFeature) => boolean
  /** Paket yang berlaku untuk satu produk (langganan terpisah per produk). */
  getPlanFor: (produk: Produk) => PlanId
  /** Batas kuota & fitur untuk satu produk. */
  getLimitsFor: (produk: Produk) => typeof PLAN_LIMITS[PlanId]
  /** Langganan aktif untuk satu produk, bila ada. */
  getSubscriptionFor: (produk: Produk) => Subscription | null

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
  subscriptions: [],
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
  planCatalog: [],
  addonFeaturesEnabled: false,
  addonFsPrice: 75000,
  addonCostPrice: 50000,
  isAffiliateEnabled: false,
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
          set({ user: null, session: null, profile: null, subscription: null, subscriptions: [] })
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
  signUp: async (email, password, fullName, company, phone, referralCode) => {
    set({ isLoading: true, authError: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, company, phone } },
      })
      if (error) throw error

      let referredBy = null
      if (referralCode) {
        const { data: refUser } = await supabase.from('profiles').select('id').eq('referral_code', referralCode).single()
        if (refUser) {
          referredBy = refUser.id
        }
      }

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
            referred_by: referredBy,
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
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) {
      console.error("SignOut error:", e)
    } finally {
      // Force clear any leftover supabase localStorage keys just in case
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key)
        }
      })
      set({ user: null, session: null, profile: null, subscription: null, subscriptions: [] })
    }
  },

  // ── resetPassword ─────────────────────────────────────────
  resetPassword: async (email) => {
    // Pastikan selalu pakai production URL
    // bukan localhost meski dijalankan dari dev environment
    const origin = typeof window !== 'undefined'
      ? (window.location.hostname === 'localhost' 
          ? 'https://propfs.id' 
          : window.location.origin)
      : 'https://propfs.id'

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(), 
      {
        redirectTo: `${origin}/reset-password`,
      }
    )
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
      // Ambil SEMUA langganan aktif — sejak langganan dipisah per produk,
      // satu pengguna bisa punya langganan Feasibility dan Kontraktor AI
      // sekaligus dengan paket berbeda.
      const { data } = await supabase
        .from('subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      const list = (data ?? []) as Subscription[]
      set({
        subscriptions: list,
        // `subscription` dipertahankan untuk kode lama: pakai langganan
        // Feasibility bila ada, kalau tidak ambil yang terbaru.
        subscription: langgananProduk(list, 'feasibility') ?? list[0] ?? null,
      })
    } catch { /* ignore */ }
  },

  // ── loadFeatureFlags ──────────────────────────────────────
  loadFeatureFlags: async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['subscription_enabled', 'feature_flags', 'bank_details', 'trial_features', 'payment_settings', 'plan_catalog', 'addon_features_enabled', 'addon_fs_price', 'addon_cost_price', 'affiliate_enabled'])

      const subEnabled = data?.find(i => i.key === 'subscription_enabled')?.value
      const flags = data?.find(i => i.key === 'feature_flags')?.value
      const bankDetails = data?.find(i => i.key === 'bank_details')?.value
      const trialFeaturesData = data?.find(i => i.key === 'trial_features')?.value
      const paymentSettingsData = data?.find(i => i.key === 'payment_settings')?.value
      const planCatalogData = data?.find(i => i.key === 'plan_catalog')?.value
      const addonEnabled = data?.find(i => i.key === 'addon_features_enabled')?.value
      const addonFsPriceRaw = data?.find(i => i.key === 'addon_fs_price')?.value
      const addonCostPriceRaw = data?.find(i => i.key === 'addon_cost_price')?.value

      set({
        isSubscriptionEnabled: subEnabled === true || subEnabled === 'true',
        globalFeatures: typeof flags === 'object' && flags !== null ? { ...get().globalFeatures, ...flags } : get().globalFeatures,
        bankDetails: typeof bankDetails === 'object' && bankDetails !== null ? bankDetails : get().bankDetails,
        paymentSettings: typeof paymentSettingsData === 'object' && paymentSettingsData !== null ? { ...get().paymentSettings, ...(paymentSettingsData as object) } : get().paymentSettings,
        planCatalog: Array.isArray(planCatalogData) ? planCatalogData : [],
        addonFeaturesEnabled: addonEnabled === true || addonEnabled === 'true',
        addonFsPrice: addonFsPriceRaw ? Number(addonFsPriceRaw) : 75000,
        addonCostPrice: addonCostPriceRaw ? Number(addonCostPriceRaw) : 50000,
        isAffiliateEnabled: data?.find(i => i.key === 'affiliate_enabled')?.value === 'true' || data?.find(i => i.key === 'affiliate_enabled')?.value === true,
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
                title: v.faq?.title || content.faq?.title || 'Pertanyaan yang Sering Ditanyakan',
                subtitle: v.faq?.subtitle || content.faq?.subtitle || '',
                // Priority: 1) faq.items from DB (saved by CMS), 2) faqItems from DB (SQL migration), 3) default
                items: (
                  Array.isArray(v.faq?.items) && v.faq.items.length > 0 ? v.faq.items :
                  Array.isArray(v.faqItems) && v.faqItems.length > 0 ? v.faqItems :
                  content.faq?.items || []
                )
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
    console.log('[authStore] updateLandingContent start')
    const { error, data } = await supabase
      .from('app_settings')
      .upsert(
        { key: 'landing_page_cms', value: content },
        { onConflict: 'key' }
      )
      .select()

    if (error) {
      console.error('[authStore] updateLandingContent error:', error)
      throw new Error(`Gagal menyimpan: ${error.message}`)
    }

    console.log('[authStore] updateLandingContent success, rows:', data?.length)
    
    // Update local state immediately (optimistic), then confirm from DB
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

  // ── getPlanLimits ─────────────────────────────────────────
  getPlanLimits: (plan: PlanId) => {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['free']
    const catalog = get().planCatalog
    const raw = catalog?.find((p: { id?: string }) => p.id === plan)
    if (!raw) return limits

    // normalisasiPaket() memahami katalog baru (fsProjects/costProjects di
    // tingkat atas) maupun katalog lama (features.fs_projects/cost_control).
    const paket = normalisasiPaket(raw)
    if (!paket) return limits

    return {
      ...limits,
      maxProjects: Math.max(paket.fsProjects, paket.costProjects),
      maxFsProjects: paket.fsProjects,
      maxCostProjects: paket.costProjects,
      canExportPDF: paket.features?.export_pdf === true || limits.canExportPDF,
      canAccessCashflow: paket.costProjects > 0,
      canAccessARAP: paket.costProjects > 0,
    }
  },

  // ── Langganan per produk (Feasibility vs Kontraktor AI) ───
  getSubscriptionFor: (produk: Produk): Subscription | null => {
    const { subscriptions, subscription, isSubscriptionEnabled } = get()
    if (!isSubscriptionEnabled) return null
    const list = subscriptions.length > 0 ? subscriptions : (subscription ? [subscription] : [])
    return langgananProduk(list, produk)
  },

  getPlanFor: (produk: Produk): PlanId => {
    const { subscriptions, subscription, isSubscriptionEnabled } = get()
    if (!isSubscriptionEnabled) return 'free'
    const list = subscriptions.length > 0 ? subscriptions : (subscription ? [subscription] : [])
    return planProduk(list, produk) as PlanId
  },

  getLimitsFor: (produk: Produk) => get().getPlanLimits(get().getPlanFor(produk)),

  // ── canCreateProject ──────────────────────────────────────
  canCreateProject: (activeProjectCount: number, addonType?: 'fs' | 'cost'): boolean => {
    const { profile, isSubscriptionEnabled } = get()

    // Kuota dihitung dari langganan produk yang bersangkutan.
    const produk = produkDariJenisProyek(addonType === 'cost' ? 'cost' : 'fs')
    const plan = get().getPlanFor(produk)
    const limits = get().getPlanLimits(plan)

    // Bonus slots from add-on purchases
    const addonFsSlots = (profile as any)?.addon_fs_slots ?? 0
    const addonCostSlots = (profile as any)?.addon_cost_slots ?? 0

    if (addonType === 'cost') {
      // Use catalog-driven cost_control limit
      const maxCost = (limits as any).maxCostProjects ?? 0
      const effectiveMax = maxCost + addonCostSlots
      if (!isSubscriptionEnabled) return true
      return activeProjectCount < effectiveMax
    }

    // Default: FS (or no type specified)
    const maxFs = (limits as any).maxFsProjects ?? limits.maxProjects
    const effectiveMax = maxFs + addonFsSlots

    // ALWAYS enforce free plan permanent slot limit (total_projects_created)
    if (limits.projectSlotPermanent) {
      return (profile?.total_projects_created ?? 0) < effectiveMax
    }

    // For paid plans: only enforce active project count limit when subscription is enabled
    if (!isSubscriptionEnabled) return true
    return activeProjectCount < effectiveMax
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

    // Kunci fitur berdasarkan langganan PRODUK pemilik fitur tersebut, bukan
    // satu langganan global — Feasibility & Kontraktor AI dilanggan terpisah.
    if ((feature === 'cost_control' || feature === 'cost_rab' || feature === 'cost_realisasi') && get().isSubscriptionEnabled) {
      const limits = get().getLimitsFor(produkDariFitur(feature) ?? 'kontraktor')
      if (!limits.canAccessCashflow) return false
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
