-- ============================================================
-- PropFS — Katalog harga untuk halaman PUBLIK
-- Landing page dibuka pengunjung yang BELUM login. Kalau RLS pada
-- app_settings memblokir peran anon, daftar harga tidak akan pernah terisi
-- dan kartu paket tampil "Segera".
--
-- Fungsi di bawah membuka HANYA baris plan_catalog, bukan seluruh
-- app_settings — jadi pengaturan lain (rekening bank, konfigurasi
-- pembayaran, feature flag) tetap tertutup untuk publik.
--
-- Jalankan sekali di Supabase SQL Editor.
-- ============================================================

create or replace function public.public_plan_catalog()
returns jsonb
language sql security definer stable set search_path = public as $$
  select coalesce(
    (select value from app_settings where key = 'plan_catalog' limit 1),
    '[]'::jsonb
  );
$$;

revoke all on function public.public_plan_catalog() from public;
grant execute on function public.public_plan_catalog() to anon, authenticated;
