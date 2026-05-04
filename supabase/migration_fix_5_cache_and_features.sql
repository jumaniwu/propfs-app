-- ============================================================
-- PROPFS: MIGRATION SQL - FIX SCHEMA CACHE & MISSING COLUMNS
-- ============================================================

-- 1. Tambahkan kolom custom_features ke tabel profiles (jika belum ada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='profiles' AND column_name='custom_features'
  ) THEN
    ALTER TABLE profiles ADD COLUMN custom_features JSONB DEFAULT '{}';
  END IF;
END$$;

-- 2. RELOAD SCHEMA CACHE
-- Ini sangat penting untuk memperbaiki error "Could not find the table 'public.subscriptions' in the schema cache"
NOTIFY pgrst, reload_schema;
