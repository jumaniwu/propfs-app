-- ============================================================
-- PROJECTS TABLE — RLS Policies
-- ============================================================

-- 1. Enable RLS on projects table (just in case it is disabled)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
DROP POLICY IF EXISTS "Superadmin can read all projects" ON public.projects;
DROP POLICY IF EXISTS "Superadmin can do anything to projects" ON public.projects;

-- 3. Create policies for standard users
CREATE POLICY "Users can read own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Create policies for Superadmins (using the is_superadmin function from migration_fix_2)
CREATE POLICY "Superadmin can do anything to projects"
  ON public.projects FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ============================================================
-- APP_SETTINGS TABLE — Additional Fix
-- ============================================================
-- Ensure app_settings can be updated by superadmin if it already exists
-- (Already handled in migration_fix_2, but let's double check row exists)
INSERT INTO app_settings (key, value) 
VALUES ('landing_page_cms', '{}')
ON CONFLICT (key) DO NOTHING;

-- DONE!
