-- ============================================================
-- PROPFS: MIGRATION SQL - 8
-- MENAMBAHKAN EMAIL DAN TRIGGER PROFILE OTOMATIS
-- ============================================================

-- 1. Tambahkan kolom email ke tabel profiles (jika belum ada)
DO $$ 
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='email') THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;
END $$;

-- 2. Buat fungsi trigger otomatis untuk sinkronisasi data dari auth.users ke profiles
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    company, 
    phone, 
    email,
    role, 
    total_projects_created
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'company',
    NEW.raw_user_meta_data->>'phone',
    NEW.email,
    'user',
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    company = EXCLUDED.company,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Hapus trigger lama (jika ada) dan pasang trigger baru pada auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4. Update data profile lama yang email/company-nya mungkin kosong 
-- dengan mengambil data dari tabel auth.users (Backfill)
UPDATE public.profiles p
SET 
  email = u.email,
  company = COALESCE(p.company, u.raw_user_meta_data->>'company', '-'),
  phone = COALESCE(p.phone, u.raw_user_meta_data->>'phone', '-'),
  full_name = COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', 'Tanpa Nama')
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.company IS NULL OR p.company = '-');

-- Selesai! Schema cache di-reload.
NOTIFY pgrst, 'reload schema';
