-- ============================================================
-- PropFS — Login Tim terpisah dengan Kode Perusahaan
--
-- Sebelumnya anggota tim login memakai email pribadinya di halaman login
-- utama, sehingga akun tim bercampur dengan akun PropFS pribadi: kalau
-- emailnya sudah pernah dipakai mendaftar, password yang dibuatkan admin
-- tidak berlaku dan login selalu ditolak.
--
-- Sekarang tiap perusahaan punya KODE PERUSAHAAN (mis. PFS-4K7M) dan tiap
-- anggota punya USERNAME yang cukup unik di dalam perusahaannya. Di balik
-- layar keduanya dipetakan ke satu email internal
--   <username>@<kode>.tim.propfs.id
-- yang tidak akan pernah bentrok dengan email pribadi siapa pun.
--
-- Jalankan sekali di Supabase SQL Editor, SETELAH:
--   migration_team.sql, migration_company_profile.sql
-- ============================================================

-- ── 1. Kode perusahaan ──────────────────────────────────────────────────────
alter table public.company_profiles
  add column if not exists kode text;

create unique index if not exists idx_company_kode
  on public.company_profiles(kode) where kode is not null;

-- Alfabet tanpa huruf/angka yang mudah tertukar saat dibacakan lewat telepon
-- (tanpa 0/O, 1/I/L). Kode dibacakan admin ke karyawan, jadi ini penting.
create or replace function public.buat_kode_perusahaan()
returns text language plpgsql security definer set search_path = public as $$
declare
  huruf constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  kandidat text;
  i int;
begin
  loop
    kandidat := 'PFS-';
    for i in 1..4 loop
      kandidat := kandidat || substr(huruf, 1 + floor(random() * length(huruf))::int, 1);
    end loop;
    exit when not exists (select 1 from company_profiles c where c.kode = kandidat);
  end loop;
  return kandidat;
end $$;

-- Kode perusahaan milik pengguna yang sedang login; dibuatkan bila belum ada.
-- Baris company_profiles ikut dibuat agar pemilik baru langsung punya kode.
create or replace function public.kode_perusahaan_saya()
returns text language plpgsql security definer set search_path = public as $$
declare
  hasil text;
begin
  if auth.uid() is null then return null; end if;

  select c.kode into hasil from company_profiles c where c.user_id = auth.uid();
  if hasil is not null and hasil <> '' then return hasil; end if;

  hasil := public.buat_kode_perusahaan();
  insert into company_profiles (user_id, kode) values (auth.uid(), hasil)
    on conflict (user_id) do update set kode = excluded.kode
    where company_profiles.kode is null or company_profiles.kode = '';

  select c.kode into hasil from company_profiles c where c.user_id = auth.uid();
  return hasil;
end $$;

-- Dipakai halaman login tim SEBELUM pengguna masuk, jadi terbuka untuk anon.
-- Hanya mengembalikan nama perusahaan sebagai konfirmasi "kode ini benar" —
-- owner_id maupun data lain tidak ikut dibuka.
create or replace function public.perusahaan_by_kode(p_kode text)
returns table (nama_perusahaan text)
language sql security definer stable set search_path = public as $$
  select coalesce(nullif(c.nama_perusahaan, ''), 'Perusahaan')
  from company_profiles c
  where c.kode = upper(trim(p_kode))
  limit 1;
$$;

revoke all on function public.buat_kode_perusahaan() from public;
revoke all on function public.kode_perusahaan_saya() from public;
revoke all on function public.perusahaan_by_kode(text) from public;
grant execute on function public.kode_perusahaan_saya() to authenticated;
grant execute on function public.perusahaan_by_kode(text) to anon, authenticated;

-- ── 2. Username anggota tim ─────────────────────────────────────────────────
alter table public.team_members
  add column if not exists username text,
  -- email internal yang benar-benar dipakai auth.users; berbeda dengan
  -- member_email yang tetap menyimpan email asli untuk kontak.
  add column if not exists login_email text;

create unique index if not exists idx_team_username
  on public.team_members(owner_id, lower(username)) where username is not null;

-- member_email tidak lagi wajib unik per workspace: dua karyawan boleh
-- berbagi satu email kantor karena yang membedakan sekarang username.
alter table public.team_members drop constraint if exists team_members_owner_id_member_email_key;

-- ── 3. Workspace ikut membawa kode & paket pemilik ──────────────────────────
-- Anggota tim tidak punya langganan sendiri; hak akses Kontraktor AI-nya
-- menumpang langganan perusahaan. Tanpa data ini, penjaga rute di aplikasi
-- akan menendang anggota keluar dari /kontraktor.
--
-- Fungsi lama mengembalikan 4 kolom, versi ini 8. Postgres menolak
-- `create or replace` yang mengubah bentuk hasil (ERROR 42P13), jadi fungsi
-- lamanya harus dibuang lebih dulu. Tidak ada policy yang bergantung padanya
-- — hanya dipanggil dari aplikasi — sehingga drop ini aman.
drop function if exists public.my_workspaces();

create or replace function public.my_workspaces()
returns table (
  owner_id uuid, nama text, perusahaan text, role text,
  kode text, owner_plan text, owner_plan_expires timestamptz,
  owner_trial_expires timestamptz
)
language sql security definer stable set search_path = public as $$
  select t.owner_id,
         coalesce(p.full_name, ''),
         coalesce(nullif(c.nama_perusahaan, ''), p.company, ''),
         t.role,
         coalesce(c.kode, ''),
         coalesce(sub.plan_id, 'free'),
         sub.expired_at,
         p.trial_expires_at
  from team_members t
  left join profiles p on p.id = t.owner_id
  left join company_profiles c on c.user_id = t.owner_id
  -- Langganan Kontraktor AI milik pemilik workspace. Baris lama tanpa
  -- `product` berlaku untuk kedua produk, jadi ikut diterima sebagai cadangan.
  left join lateral (
    select s.plan_id, s.expired_at
    from subscriptions s
    where s.user_id = t.owner_id and s.status = 'active'
      and (s.product = 'kontraktor' or s.product is null)
    order by (s.product = 'kontraktor') desc, s.expired_at desc nulls first
    limit 1
  ) sub on true
  where t.member_user_id = auth.uid() and t.status = 'aktif';
$$;

revoke all on function public.my_workspaces() from public;
grant execute on function public.my_workspaces() to authenticated;
