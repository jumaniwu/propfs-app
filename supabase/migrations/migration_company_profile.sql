-- ============================================================
-- PropFS — Profil Perusahaan (branding laporan Kontraktor AI)
-- Nama PT, logo, dan data kontak yang dipakai di semua laporan.
-- Bila profil ini terisi, identitas PropFS tidak lagi dicetak di laporan.
--
-- Jalankan sekali di Supabase SQL Editor.
-- Jalankan SETELAH migration_team.sql bila Anda memakai fitur Tim
-- (kebijakan di bawah memakai fungsi is_team_member).
-- ============================================================

create table if not exists public.company_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nama_perusahaan text not null default '',
  logo_url text default '',        -- data URL logo (sudah dikecilkan)
  alamat text default '',
  telepon text default '',
  email text default '',
  website text default '',
  npwp text default '',
  updated_at timestamptz not null default now()
);

alter table public.company_profiles enable row level security;

-- Pemilik mengelola profilnya sendiri.
drop policy if exists "company_profiles_owner" on public.company_profiles;
create policy "company_profiles_owner" on public.company_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anggota tim boleh MEMBACA profil perusahaan tempat ia bekerja, supaya
-- laporan yang ia cetak memakai kop perusahaan yang sama.
-- Dilewati bila migration_team.sql belum dijalankan.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_team_member'
  ) then
    execute $pol$
      drop policy if exists "company_profiles_team_read" on public.company_profiles;
      create policy "company_profiles_team_read" on public.company_profiles
        for select using (public.is_team_member(user_id));
    $pol$;
  end if;
end $$;

-- ============================================================
-- Branding untuk halaman PUBLIK (tanpa login)
-- Pekerja, owner, vendor, dan konsumen membuka link bertoken. Fungsi ini
-- mengembalikan nama & logo perusahaan pemilik link tersebut, sehingga
-- halaman yang mereka lihat memakai identitas perusahaan — bukan PropFS.
-- Hanya nama & logo yang dibuka; data kontak lain tidak ikut.
-- ============================================================
create or replace function public.branding_by_token(p_token text)
returns table (nama_perusahaan text, logo_url text)
language sql security definer stable set search_path = public as $$
  select coalesce(c.nama_perusahaan, ''), coalesce(c.logo_url, '')
  from company_profiles c
  where c.user_id = (
    -- token bisa berasal dari laporan lapangan, kalender owner, SPK, atau opname
    select user_id from field_logs
      where report_token = p_token or view_token = p_token
    union all
    select user_id from spk_docs where sign_token = p_token
    union all
    select user_id from opname_forms where fill_token = p_token
    limit 1
  );
$$;

revoke all on function public.branding_by_token(text) from public;
grant execute on function public.branding_by_token(text) to anon, authenticated;
