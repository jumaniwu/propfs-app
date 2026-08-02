-- ============================================================
-- PropFS — Kuota proyek yang bisa disetel per pelanggan
--
-- Sampai sekarang jumlah proyek hanya datang dari paket langganan. Pelanggan
-- yang menawar di luar paket standar — "kami ambil Kontraktor AI tapi minta 12
-- proyek" — hanya bisa dilayani dengan membuat paket baru yang tidak dipakai
-- siapa pun lagi, dan katalog jadi penuh paket sekali pakai.
--
-- Dua kolom di bawah menyimpan kesepakatan itu di tempat yang benar: pada
-- pelanggannya, bukan pada katalog.
--
--   NULL  = ikut paket (belum ada kesepakatan khusus)
--   -1    = tak terbatas
--   0     = benar-benar nol; keputusan sadar untuk mengunci
--   n     = tepat n proyek
--
-- Perbedaan NULL dan 0 sengaja dijaga. Keduanya "tidak boleh membuat apa-apa"
-- bagi pelanggan paket gratis, tetapi artinya berbeda: yang satu belum
-- diputuskan, yang satu sudah.
--
-- SUPERADMIN tidak memakai kolom ini sama sekali — ia selalu tak terbatas,
-- diputuskan di kode (src/lib/kuotaProyek.ts), bukan lewat baris basis data
-- yang bisa lupa diisi.
--
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan berulang kali.
-- ============================================================

alter table public.profiles
  add column if not exists kuota_fs integer,
  add column if not exists kuota_kontraktor integer;

comment on column public.profiles.kuota_fs is
  'Batas proyek Feasibility Study. NULL = ikut paket, -1 = tak terbatas.';
comment on column public.profiles.kuota_kontraktor is
  'Batas proyek Kontraktor AI. NULL = ikut paket, -1 = tak terbatas.';

-- Nilai selain NULL harus masuk akal: -1 (tak terbatas) atau nol ke atas.
-- Tanpa batas ini, -7 akan tersimpan diam-diam dan dibaca sebagai tak terbatas
-- oleh klien — benar hasilnya, tetapi menyembunyikan salah ketik.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_kuota_fs_masuk_akal'
  ) then
    alter table public.profiles
      add constraint profiles_kuota_fs_masuk_akal
      check (kuota_fs is null or kuota_fs >= -1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_kuota_kontraktor_masuk_akal'
  ) then
    alter table public.profiles
      add constraint profiles_kuota_kontraktor_masuk_akal
      check (kuota_kontraktor is null or kuota_kontraktor >= -1);
  end if;
end $$;

-- ── Siapa yang boleh mengubahnya ────────────────────────────────────────────
-- Hanya superadmin. Kalau pemakai biasa bisa menulis kolom ini di profilnya
-- sendiri lewat PostgREST, seluruh sistem langganan kehilangan artinya.
--
-- Kebijakan RLS profiles yang sudah ada tidak diubah (pemakai tetap boleh
-- memperbarui nama, perusahaan, telepon). Yang dipasang di sini adalah pemicu
-- yang menolak perubahan kedua kolom itu bila yang mengubah bukan superadmin.
create or replace function public.kuota_hanya_superadmin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Berubah atau tidak diperiksa dengan `is distinct from` supaya NULL ikut
  -- terbaca; `<>` menghasilkan NULL bila salah satunya NULL dan pemeriksaannya
  -- akan terlewat begitu saja.
  if new.kuota_fs is distinct from old.kuota_fs
     or new.kuota_kontraktor is distinct from old.kuota_kontraktor then
    if not exists (
      select 1 from profiles p
       where p.id = auth.uid() and p.role = 'superadmin'
    ) then
      raise exception 'Kuota proyek hanya bisa diubah superadmin.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_kuota_hanya_superadmin on public.profiles;
create trigger trg_kuota_hanya_superadmin before update on public.profiles
  for each row execute function public.kuota_hanya_superadmin();
