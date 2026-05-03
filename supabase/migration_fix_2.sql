-- ============================================================
-- BULLETPROOF SUPERADMIN ROLE CHECK
-- ============================================================

-- 1. Create a SECURITY DEFINER function to safely check role without triggering recursive RLS
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Security definer bypasses RLS on profiles table, preventing infinite recursion
  SELECT (role = 'superadmin') INTO is_admin 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  RETURN COALESCE(is_admin, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- APP_SETTINGS TABLE — RLS Policies
-- ============================================================

-- Drop ALL existing policies on app_settings to start fresh
DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Superadmin can insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Superadmin can update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Superadmin can delete app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Superadmin can upsert app_settings" ON public.app_settings;

-- 2. Recreate policies using the bulletproof function
CREATE POLICY "Anyone can read app_settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Superadmin can insert app_settings"
  ON public.app_settings FOR INSERT
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmin can update app_settings"
  ON public.app_settings FOR UPDATE
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmin can delete app_settings"
  ON public.app_settings FOR DELETE
  USING (public.is_superadmin());

-- ============================================================
-- PROFILES TABLE — RLS Policies Fix (remove recursive risk)
-- ============================================================
DROP POLICY IF EXISTS "Superadmin can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Superadmin can update all profiles" ON public.profiles;

CREATE POLICY "Superadmin can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "Superadmin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_superadmin());

-- ============================================================
-- INVOICES TABLE — RLS Policies Fix
-- ============================================================
DROP POLICY IF EXISTS "Superadmin can update all invoices" ON public.invoices;

CREATE POLICY "Superadmin can update all invoices"
  ON public.invoices FOR UPDATE
  USING (public.is_superadmin());

-- ============================================================
-- SUBSCRIPTIONS TABLE — RLS Policies Fix
-- ============================================================
DROP POLICY IF EXISTS "Superadmin can update subscriptions" ON public.subscriptions;

CREATE POLICY "Superadmin can update subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (public.is_superadmin());

-- DONE!
