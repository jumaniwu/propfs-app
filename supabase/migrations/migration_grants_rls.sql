-- ============================================================
-- PropFS — Migration: Supabase GRANT Fix (May 2026 Compliance)
-- Run this in: Supabase Dashboard > SQL Editor
-- Required BEFORE October 30, 2026 enforcement date.
-- ============================================================
-- This ensures all tables in the public schema (including new ones
-- added by add-on migrations) have correct role grants for
-- supabase-js / PostgREST Data API access.
-- ============================================================

-- ── PROFILES ─────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;

-- ── SUBSCRIPTIONS ────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- ── INVOICES ─────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

-- ── APP_SETTINGS ─────────────────────────────────────────────
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- ── FUNCTION: increment_addon_slots (called by webhook via service_role) ──
GRANT EXECUTE ON FUNCTION public.increment_addon_slots(UUID, TEXT) TO service_role;

-- ── ROW LEVEL SECURITY (ensure RLS is on for all user tables) ─
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- ── RLS POLICIES (safe: skip if already exists) ──────────────

-- Profiles: users can read/update their own row
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_self_read') THEN
    CREATE POLICY profiles_self_read ON public.profiles
      FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_self_update') THEN
    CREATE POLICY profiles_self_update ON public.profiles
      FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- Subscriptions: users can read their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='subscriptions_self_read') THEN
    CREATE POLICY subscriptions_self_read ON public.subscriptions
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Invoices: users can read/insert their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='invoices_self_read') THEN
    CREATE POLICY invoices_self_read ON public.invoices
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='invoices_self_insert') THEN
    CREATE POLICY invoices_self_insert ON public.invoices
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
