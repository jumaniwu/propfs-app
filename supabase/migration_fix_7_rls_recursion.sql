-- ============================================================
-- PROPFS: MIGRATION SQL - FIX RLS RECURSION
-- ============================================================
-- Masalah: Query "EXISTS(SELECT 1 FROM profiles ...)" di dalam 
-- policy RLS menyebabkan infinite recursion (loop tanpa akhir) 
-- ketika tabel profiles diakses. Akibatnya, query dari Superadmin
-- diblokir secara diam-diam oleh PostgreSQL.
-- Solusi: Gunakan fungsi SECURITY DEFINER untuk mengecek role
-- tanpa memicu RLS, lalu gunakan fungsi itu di semua policy.
-- ============================================================

-- 1. Buat fungsi helper untuk cek superadmin bypass RLS
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Akses tabel profiles bypass RLS (karena SECURITY DEFINER)
  SELECT (role = 'superadmin') INTO is_admin 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  RETURN coalesce(is_admin, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Perbaiki RLS Profiles (menghindari recursion)
DROP POLICY IF EXISTS "Superadmin can read all profiles" ON profiles;
CREATE POLICY "Superadmin can read all profiles"
  ON profiles FOR SELECT
  USING (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update all profiles" ON profiles;
CREATE POLICY "Superadmin can update all profiles"
  ON profiles FOR UPDATE
  USING (is_superadmin());

-- 3. Perbaiki RLS Invoices
DROP POLICY IF EXISTS "Superadmin can read all invoices" ON invoices;
CREATE POLICY "Superadmin can read all invoices"
  ON invoices FOR SELECT
  USING (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update all invoices" ON invoices;
CREATE POLICY "Superadmin can update all invoices"
  ON invoices FOR UPDATE
  USING (is_superadmin());

-- 4. Perbaiki RLS Subscriptions
DROP POLICY IF EXISTS "Superadmin can read all subscriptions" ON subscriptions;
CREATE POLICY "Superadmin can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update subscriptions" ON subscriptions;
CREATE POLICY "Superadmin can update subscriptions"
  ON subscriptions FOR UPDATE
  USING (is_superadmin());

-- 5. Perbaiki RLS App_Settings
DROP POLICY IF EXISTS "Superadmin can insert app_settings" ON app_settings;
CREATE POLICY "Superadmin can insert app_settings"
  ON app_settings FOR INSERT
  WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update app_settings" ON app_settings;
CREATE POLICY "Superadmin can update app_settings"
  ON app_settings FOR UPDATE
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- ✅ Selesai! Data pelanggan dan invoice sekarang akan muncul 
-- secara normal di Dashboard Admin.
