-- ============================================================
-- PROPFS: MIGRATION SQL - Jalankan ini di Supabase SQL Editor
-- Fixes: RLS policies for profiles, invoices, subscriptions
-- ============================================================

-- 1. Seed missing app_settings rows (upsert safe)
INSERT INTO app_settings (key, value) VALUES
  ('feature_flags', '{"fs_module":true,"cost_control":true,"cost_rab":true,"cost_material":false,"cost_realisasi":true,"ai_solver":true,"pdf_export":true,"scurve":true,"dashboard_admin":false}'),
  ('ppn_rate', '0.11'),
  ('subscription_enabled', 'false'),
  ('plan_catalog', '{}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. PROFILES TABLE — RLS Policies
-- ============================================================

-- Allow users to INSERT their own profile on registration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can insert own profile"
        ON profiles FOR INSERT
        WITH CHECK (auth.uid() = id)
    ';
  END IF;
END$$;

-- Allow users to SELECT their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Users can read own profile'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can read own profile"
        ON profiles FOR SELECT
        USING (auth.uid() = id)
    ';
  END IF;
END$$;

-- Allow users to UPDATE their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can update own profile"
        ON profiles FOR UPDATE
        USING (auth.uid() = id)
    ';
  END IF;
END$$;

-- Superadmin can READ ALL profiles (for Admin Users panel)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Superadmin can read all profiles'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can read all profiles"
        ON profiles FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- Superadmin can UPDATE all profiles (role changes, feature bypass)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Superadmin can update all profiles'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can update all profiles"
        ON profiles FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- ============================================================
-- 3. INVOICES TABLE — RLS Policies
-- ============================================================

-- Allow users to INSERT their own invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoices' AND policyname = 'Users can insert own invoices'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can insert own invoices"
        ON invoices FOR INSERT
        WITH CHECK (auth.uid() = user_id)
    ';
  END IF;
END$$;

-- Allow users to SELECT their own invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoices' AND policyname = 'Users can read own invoices'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can read own invoices"
        ON invoices FOR SELECT
        USING (auth.uid() = user_id)
    ';
  END IF;
END$$;

-- Allow users to UPDATE their own invoices (status change after payment)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoices' AND policyname = 'Users can update own invoices'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can update own invoices"
        ON invoices FOR UPDATE
        USING (auth.uid() = user_id)
    ';
  END IF;
END$$;

-- Superadmin can READ ALL invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoices' AND policyname = 'Superadmin can read all invoices'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can read all invoices"
        ON invoices FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- Superadmin can UPDATE all invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoices' AND policyname = 'Superadmin can update all invoices'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can update all invoices"
        ON invoices FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- ============================================================
-- 4. SUBSCRIPTIONS TABLE — RLS Policies
-- ============================================================

-- Allow users to INSERT their own subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subscriptions' AND policyname = 'Superadmin or user can insert subscriptions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin or user can insert subscriptions"
        ON subscriptions FOR INSERT
        WITH CHECK (auth.uid() = user_id)
    ';
  END IF;
END$$;

-- Allow users to SELECT their own subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subscriptions' AND policyname = 'Users can read own subscriptions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can read own subscriptions"
        ON subscriptions FOR SELECT
        USING (auth.uid() = user_id)
    ';
  END IF;
END$$;

-- Superadmin can read all subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subscriptions' AND policyname = 'Superadmin can read all subscriptions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can read all subscriptions"
        ON subscriptions FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- Superadmin can update subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subscriptions' AND policyname = 'Superadmin can update subscriptions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can update subscriptions"
        ON subscriptions FOR UPDATE
        USING (EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''superadmin''
        ))
    ';
  END IF;
END$$;

-- ============================================================
-- 5. APP_SETTINGS TABLE — RLS Policies (public read, admin write)
-- Drop old catch-all policy first to avoid conflicts
-- ============================================================

-- Drop old combined policy if it exists (it blocked INSERTs without WITH CHECK)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'app_settings' AND policyname = 'Superadmin can upsert app_settings'
  ) THEN
    EXECUTE 'DROP POLICY "Superadmin can upsert app_settings" ON app_settings';
  END IF;
END$$;

-- Public SELECT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'app_settings' AND policyname = 'Anyone can read app_settings'
  ) THEN
    EXECUTE '
      CREATE POLICY "Anyone can read app_settings"
        ON app_settings FOR SELECT
        USING (true)
    ';
  END IF;
END$$;

-- Superadmin INSERT (needed for upsert when row doesn't exist yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'app_settings' AND policyname = 'Superadmin can insert app_settings'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can insert app_settings"
        ON app_settings FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- Superadmin UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'app_settings' AND policyname = 'Superadmin can update app_settings'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can update app_settings"
        ON app_settings FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- ✅ Done! Refresh the browser to apply all changes.

