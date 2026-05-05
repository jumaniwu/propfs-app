-- ============================================================
-- PROPFS: MIGRATION SQL - FIX RLS RECURSION & MISSING TABLES
-- ============================================================
-- Skrip ini menggabungkan pembuatan tabel yang hilang (invoices)
-- dan perbaikan struktur RLS (Row Level Security) agar terhindar 
-- dari infinite recursion yang menyebabkan dashboard admin kosong.
-- ============================================================

-- ==========================================
-- 1. BUAT TABEL INVOICES (JIKA BELUM ADA)
-- ==========================================
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL,
  invoice_number  TEXT NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_end      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  subtotal_idr    INT NOT NULL DEFAULT 0,
  ppn_idr         INT NOT NULL DEFAULT 0,
  total_idr       INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'failed' | 'cancelled'
  payment_method  TEXT,
  midtrans_order_id TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. BUAT FUNGSI HELPER SUPERADMIN
-- ==========================================
-- Fungsi SECURITY DEFINER ini memungkinkan kita mengecek role
-- tanpa memicu infinite loop pada RLS profiles.
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT (role = 'superadmin') INTO is_admin 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  RETURN coalesce(is_admin, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 3. PERBAIKI KEBIJAKAN RLS PROFILES
-- ==========================================
DROP POLICY IF EXISTS "Superadmin can read all profiles" ON profiles;
CREATE POLICY "Superadmin can read all profiles"
  ON profiles FOR SELECT
  USING (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update all profiles" ON profiles;
CREATE POLICY "Superadmin can update all profiles"
  ON profiles FOR UPDATE
  USING (is_superadmin());

-- ==========================================
-- 4. PERBAIKI KEBIJAKAN RLS INVOICES
-- ==========================================
-- User biasa
DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own invoices" ON invoices;
CREATE POLICY "Users can read own invoices"
  ON invoices FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;
CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  USING (auth.uid() = user_id);

-- Superadmin
DROP POLICY IF EXISTS "Superadmin can read all invoices" ON invoices;
CREATE POLICY "Superadmin can read all invoices"
  ON invoices FOR SELECT
  USING (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update all invoices" ON invoices;
CREATE POLICY "Superadmin can update all invoices"
  ON invoices FOR UPDATE
  USING (is_superadmin());

-- ==========================================
-- 5. PERBAIKI KEBIJAKAN RLS SUBSCRIPTIONS
-- ==========================================
DROP POLICY IF EXISTS "Superadmin can read all subscriptions" ON subscriptions;
CREATE POLICY "Superadmin can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update subscriptions" ON subscriptions;
CREATE POLICY "Superadmin can update subscriptions"
  ON subscriptions FOR UPDATE
  USING (is_superadmin());

-- ==========================================
-- 6. PERBAIKI KEBIJAKAN RLS APP_SETTINGS
-- ==========================================
DROP POLICY IF EXISTS "Superadmin can insert app_settings" ON app_settings;
CREATE POLICY "Superadmin can insert app_settings"
  ON app_settings FOR INSERT
  WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update app_settings" ON app_settings;
CREATE POLICY "Superadmin can update app_settings"
  ON app_settings FOR UPDATE
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- ==========================================
-- 7. RELOAD SCHEMA CACHE
-- ==========================================
NOTIFY pgrst, 'reload schema';

-- ✅ SELESAI! Struktur database Anda sekarang sudah lengkap dan aman.
