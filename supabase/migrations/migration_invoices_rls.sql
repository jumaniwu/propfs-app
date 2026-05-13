-- ============================================================
-- Migration: Fix RLS on invoices table
-- Jalankan ini di Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Pastikan RLS diaktifkan
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 2. Hapus policy lama jika ada (agar tidak bentrok)
DROP POLICY IF EXISTS "Users can view own invoices"   ON public.invoices;
DROP POLICY IF EXISTS "Users can insert own invoices"  ON public.invoices;
DROP POLICY IF EXISTS "Admins can view all invoices"   ON public.invoices;

-- 3. User hanya bisa baca invoice miliknya sendiri
CREATE POLICY "Users can view own invoices"
ON public.invoices
FOR SELECT
USING (auth.uid() = user_id);

-- 4. User hanya bisa insert invoice untuk dirinya sendiri
CREATE POLICY "Users can insert own invoices"
ON public.invoices
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 5. User bisa update invoice miliknya (untuk update status)
CREATE POLICY "Users can update own invoices"
ON public.invoices
FOR UPDATE
USING (auth.uid() = user_id);

-- 6. Superadmin (service_role) bisa akses semua invoice
-- Ini sudah otomatis karena service_role bypass RLS
-- Tapi buat explicit policy untuk admin dengan role superadmin:
CREATE POLICY "Admins can view all invoices"
ON public.invoices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- ============================================================
-- Verifikasi RLS aktif:
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = 'invoices';
-- ============================================================
