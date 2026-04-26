// ============================================================
// PropFS — Supabase Client Singleton
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey)

export type PlanId = 'free' | 'basic' | 'pro'

export type AppFeature = 
  | 'fs_module'
  | 'cost_control'
  | 'ai_solver'
  | 'pdf_export'
  | 'scurve'
  | 'dashboard_admin'

export interface LandingPageContent {
  branding: {
    logoUrl: string
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
}

export interface AppSetting {
  key: string
  value: any
  updated_at: string
}

export interface Profile {
  id:                     string
  full_name:              string | null
  company:                string | null
  phone:                  string | null
  role:                   'user' | 'admin' | 'superadmin'
  total_projects_created: number
  custom_features?:       Record<AppFeature, boolean>
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
  expires_at:         string | null
  midtrans_order_id:  string | null
  created_at:         string
  plan?:              SubscriptionPlan
}
