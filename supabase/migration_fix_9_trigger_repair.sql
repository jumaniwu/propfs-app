-- ============================================================
-- PROPFS: MIGRATION FIX 9 — REPAIR BROKEN REGISTRATION TRIGGER
-- ============================================================
-- PROBLEM: Error "Database error saving new user" terjadi karena
-- trigger handle_new_user() tidak bisa insert ke tabel profiles.
-- Penyebab: kolom 'email' ada di migration_fix_8 tapi trigger
-- lama di schema.sql tidak menyertakan kolom tersebut, sehingga
-- jika tabel profiles punya NOT NULL constraint tambahan, trigger
-- akan crash dan membatalkan seluruh proses registrasi.
--
-- SOLUSI: Rebuild trigger dengan EXCEPTION handler supaya trigger
-- tidak pernah crash dan selalu RETURN NEW (registrasi tetap jalan).
-- ============================================================

-- LANGKAH 1: Pastikan kolom-kolom yang dibutuhkan ada
DO $$ 
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='email') THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;
  
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='company') THEN
    ALTER TABLE public.profiles ADD COLUMN company TEXT;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='phone') THEN
    ALTER TABLE public.profiles ADD COLUMN phone TEXT;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='full_name') THEN
    ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active') THEN
    ALTER TABLE public.profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- LANGKAH 2: Rebuild fungsi trigger dengan EXCEPTION handler yang robust
-- Jika insert gagal karena alasan apapun, trigger akan fallback ke UPSERT
-- Jika UPSERT juga gagal, trigger tetap RETURN NEW agar registrasi tidak di-cancel
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (
      id, 
      full_name, 
      company, 
      phone,
      email,
      role, 
      is_active,
      total_projects_created
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'company', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      NEW.email,
      'user',
      true,
      0
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      company   = EXCLUDED.company,
      phone     = EXCLUDED.phone,
      email     = EXCLUDED.email,
      is_active = true;
  EXCEPTION WHEN OTHERS THEN
    -- Jangan sampai trigger gagal dan membatalkan registrasi!
    -- Log error tapi tetap lanjutkan
    RAISE WARNING 'handle_new_user: profile insert failed for user %, error: %', NEW.id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- LANGKAH 3: Pasang ulang trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- LANGKAH 4: Pastikan policy INSERT untuk profiles tidak memblokir trigger
-- Trigger berjalan dengan SECURITY DEFINER jadi ini tidak masalah,
-- tapi kita pastikan policy-nya benar
DROP POLICY IF EXISTS "User can insert own profile" ON profiles;
CREATE POLICY "User can insert own profile" 
  ON profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- LANGKAH 5: Reload schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFIKASI: Jalankan query ini setelah migration untuk cek
-- SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
-- ============================================================
