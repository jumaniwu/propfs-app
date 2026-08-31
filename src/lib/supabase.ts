// ============================================================
// PropFS — Supabase Client Singleton
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = ((import.meta as any).env.VITE_SUPABASE_URL as string) || 'https://ciazztqmkhzrgbaqfyyz.supabase.co'

/**
 * Nama laci penyimpanan sesi milik supabase-js.
 *
 * Diekspor supaya modul lain membaca sesi dari laci yang SAMA. Menghitungnya
 * sendiri dari `import.meta.env` sudah pernah meleset: ketika variabelnya
 * tidak disetel, perhitungan itu menghasilkan nama kosong sementara klien di
 * sini memakai URL cadangan — dan yang membaca menemukan laci kosong lalu
 * menyimpulkan pemakainya belum login.
 */
export const KUNCI_SESI = `sb-${supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]}-auth-token`
const supabaseKey  = ((import.meta as any).env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_1BxZhA48DtR8KG94xUm0zg_6w-dg1xD'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // WAJIB: agar Supabase parse access_token dari URL hash fragment
    detectSessionInUrl: true,
    // WAJIB: agar session persist setelah redirect dari email
    persistSession: true,
    autoRefreshToken: true,
    // Navigator LockManager antar-tab sering deadlock di Chrome mobile
    // (banyak tab terbuka) sehingga SEMUA query DB menggantung menunggu
    // token. Lock diganti pass-through: setiap tab mengelola tokennya
    // sendiri; refresh ganda aman karena Supabase punya grace period
    // reuse refresh-token.
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  }
})

export type PlanId = 'free' | 'basic' | 'pro'

export type AppFeature = 
  | 'fs_module'
  | 'cost_control'
  | 'cost_rab'
  | 'cost_material'
  | 'cost_realisasi'
  | 'ai_solver'
  | 'pdf_export'
  | 'scurve'
  | 'dashboard_admin'

export interface LandingPageContent {
  branding: {
    logoUrl: string
    faviconUrl?: string
    siteName: string
    tagline: string
  }
  hero: {
    title: string
    subtitle: string
    hashtags: string[]
    imageUrl: string
  }
  suitableFor: {
    label: string
    tags: string[]
  }
  features: {
    id: string
    title: string
    desc: string
    iconName: string
  }[]
  auxiliaryProducts: {
    id: string
    title: string
    desc: string
    iconName: string
  }[]
  marketingHighlight: {
    title: string
    desc: string
    imageUrl: string
  }
  footer: {
    copyrightText: string
    email: string
    phone: string
    address: string
    whatsappUrl: string
  }
  faq?: {
    title: string
    subtitle: string
    items: Array<{
      id: string
      question: string
      answer: string
    }>
  }
}

export interface AppSetting {
  key: string
  value: any
  updated_at: string
}

export type TrialStatus = 
  'trial_active' | 
  'trial_expired' | 
  'free_forever'

export interface TrialInfo {
  status: TrialStatus
  startedAt: Date | null
  expiresAt: Date | null
  daysRemaining: number
  isExpired: boolean
  isExtended: boolean
}

export interface TrialFeatures {
  maxProjects: number
  canExportPDF: boolean
  canAccessCashflow: boolean
  canUseAiParser: boolean
  aiParserLimit: number
  canExportExcel: boolean
  description: string
}

export interface Profile {
  id:                     string
  email?:                 string | null
  full_name:              string | null
  company:                string | null
  phone:                  string | null
  role:                   'user' | 'admin' | 'superadmin'
  total_projects_created: number
  custom_features?:       Record<AppFeature, boolean>
  /**
   * Kesepakatan khusus jumlah proyek, di luar paket standar.
   * null = ikut paket · -1 = tak terbatas · 0 = benar-benar nol.
   * Hanya superadmin yang boleh mengubahnya (dijaga pemicu di basis data).
   */
  kuota_fs?:              number | null
  kuota_kontraktor?:      number | null
  trial_started_at?:      string | null
  trial_expires_at?:      string | null
  trial_status?:          TrialStatus
  is_trial_extended?:     boolean
  is_active?:             boolean
  referral_code?:         string | null
  referred_by?:           string | null
  created_at:             string
}

export interface SubscriptionPlan {
  id:           PlanId
  name:         string
  price_idr:    number
  max_projects: number
  features: {
    export_pdf:              boolean
    cashflow:                boolean
    ar_ap:                   boolean
    templates:               boolean
    project_slot_permanent:  boolean
  }
  is_active: boolean
}

export interface Subscription {
  id:                 string
  user_id:            string
  plan_id:            PlanId
  status:             'active' | 'expired' | 'cancelled'
  started_at:         string | null
  expired_at:         string | null
  midtrans_order_id:  string | null
  created_at:         string
  plan?:              SubscriptionPlan
}
