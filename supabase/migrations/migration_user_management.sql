-- Migration to add is_active to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE public.profiles SET is_active = true WHERE is_active IS NULL;
