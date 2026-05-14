-- ============================================================
-- PropFS — Migration: Add-on Project Slots
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Add addon slot columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS addon_fs_slots INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS addon_cost_slots INTEGER DEFAULT 0;

-- 2. Create helper RPC function for webhook to increment slots safely
CREATE OR REPLACE FUNCTION public.increment_addon_slots(uid UUID, slot_col TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF slot_col = 'addon_fs_slots' THEN
    UPDATE public.profiles SET addon_fs_slots = COALESCE(addon_fs_slots, 0) + 1 WHERE id = uid;
  ELSIF slot_col = 'addon_cost_slots' THEN
    UPDATE public.profiles SET addon_cost_slots = COALESCE(addon_cost_slots, 0) + 1 WHERE id = uid;
  END IF;
END;
$$;

-- 3. Seed default Add-on settings into app_settings
INSERT INTO public.app_settings (key, value)
VALUES 
  ('addon_features_enabled', 'false'),
  ('addon_fs_price', '75000'),
  ('addon_cost_price', '50000')
ON CONFLICT (key) DO NOTHING;

