-- ============================================================
-- PROPFS: MIGRATION SQL - FIX PROJECTS RLS (Data Isolation)
-- ============================================================
-- Masalah: Superadmin dapat membaca semua proyek user lain
-- melalui RLS policy "User can CRUD own projects" yang
-- mengizinkan akses ke proyek siapapun jika role = 'superadmin'.
-- Solusi: Hapus bypass superadmin, enforce user_id di semua level.
-- ============================================================

-- 1. Hapus semua policy lama pada tabel projects
DROP POLICY IF EXISTS "User can CRUD own projects" ON projects;
DROP POLICY IF EXISTS "Superadmin can read all projects" ON projects;
DROP POLICY IF EXISTS "Superadmin can crud all projects" ON projects;

-- 2. Buat policy baru yang ketat: user HANYA bisa akses proyeknya sendiri
-- Ini berlaku untuk SEMUA user termasuk superadmin di dashboard normal

CREATE POLICY "User can select own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "User can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Reload Schema Cache
NOTIFY pgrst, 'reload schema';

-- ✅ Selesai! Setiap user sekarang hanya bisa melihat proyeknya sendiri.
-- Superadmin yang butuh lihat data proyek semua user harus menggunakan
-- Supabase Service Role Key (hanya dari server-side / Admin Panel backend).
