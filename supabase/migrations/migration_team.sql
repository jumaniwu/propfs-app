-- ============================================================
-- PropFS — Kontraktor AI: Tim, Role & Manajemen Pengguna
-- Super admin perusahaan (pemilik akun) membuat User ID + password untuk
-- karyawannya, mengisi nama, jabatan, nomor WA, dan email. Role bisa
-- diubah kapan saja dari menu Pengguna.
--
-- Anggota tim memakai akun PropFS sendiri, lalu membaca/menulis data milik
-- perusahaan (workspace owner) sesuai role.
--
-- Jalankan sekali di Supabase SQL Editor SETELAH:
--   migration_cost_projects_sync.sql, migration_field_reports.sql,
--   migration_material.sql
-- ============================================================

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,  -- pemilik workspace
  member_user_id uuid references auth.users(id) on delete cascade,     -- akun anggota
  member_email text not null,
  nama text not null default '',
  jabatan text not null default '',       -- jabatan bebas, mis. "Site Manager"
  no_wa text default '',
  role text not null default 'viewer'
    check (role in ('pemilik', 'manajemen', 'keuangan', 'pm', 'pengawas', 'logistik', 'viewer')),
  project_ids text[],                     -- null = semua proyek
  status text not null default 'aktif'
    check (status in ('aktif', 'nonaktif', 'diundang')),
  invite_token text unique,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (owner_id, member_email)
);

create index if not exists idx_team_owner on public.team_members(owner_id, status);
create index if not exists idx_team_member on public.team_members(member_user_id, status);

-- ── Fungsi bantu: cek keanggotaan tanpa memicu rekursi RLS ──────────────────
-- SECURITY DEFINER + STABLE agar bisa dipanggil dari policy tabel lain.
create or replace function public.is_team_member(p_owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from team_members t
    where t.owner_id = p_owner
      and t.member_user_id = auth.uid()
      and t.status = 'aktif'
  );
$$;

-- Role anggota pada workspace tertentu (null bila bukan anggota).
create or replace function public.team_role_of(p_owner uuid)
returns text language sql security definer stable set search_path = public as $$
  select case when p_owner = auth.uid() then 'pemilik'
              else (select t.role from team_members t
                    where t.owner_id = p_owner
                      and t.member_user_id = auth.uid()
                      and t.status = 'aktif' limit 1)
         end;
$$;

-- Daftar workspace yang bisa diakses pengguna saat ini (untuk switcher).
--
-- Bentuk hasil fungsi ini DIPERLUAS oleh migrasi berikutnya
-- (migration_team_login.sql menambah `kode`, migration_team_quota.sql
-- menambah kolom plan & `owner_akses`). Postgres menolak `create or replace`
-- yang mengubah daftar kolom (ERROR 42P13), jadi versi dasar ini hanya
-- dibuat bila fungsinya belum ada. Dengan begitu migrasi ini aman dijalankan
-- ulang: tidak error, dan tidak menurunkan versi yang sudah lebih baru.
do $do$
begin
  if not exists (
    select 1 from pg_proc pr
    join pg_namespace ns on ns.oid = pr.pronamespace
    where ns.nspname = 'public' and pr.proname = 'my_workspaces'
  ) then
    execute $ddl$
      create function public.my_workspaces()
      returns table (owner_id uuid, nama text, perusahaan text, role text)
      language sql security definer stable set search_path = public as $fn$
        select t.owner_id,
               coalesce(p.full_name, ''), coalesce(p.company, ''), t.role
        from team_members t
        left join profiles p on p.id = t.owner_id
        where t.member_user_id = auth.uid() and t.status = 'aktif';
      $fn$;
    $ddl$;
  end if;
end
$do$;

alter table public.team_members enable row level security;

-- Pemilik workspace mengelola penuh daftar anggotanya
drop policy if exists "team_owner_all" on public.team_members;
create policy "team_owner_all" on public.team_members
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Anggota boleh melihat barisnya sendiri (agar tahu role & workspace-nya)
drop policy if exists "team_member_read_self" on public.team_members;
create policy "team_member_read_self" on public.team_members
  for select using (auth.uid() = member_user_id);

revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.team_role_of(uuid) from public;
revoke all on function public.my_workspaces() from public;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.team_role_of(uuid) to authenticated;
grant execute on function public.my_workspaces() to authenticated;

-- ============================================================
-- Perluas RLS tabel data agar anggota tim aktif ikut mendapat akses.
-- Cabang pemilik (auth.uid() = user_id) tetap dipertahankan lebih dulu.
-- ============================================================

drop policy if exists "cost_projects_owner" on public.cost_projects;
create policy "cost_projects_owner" on public.cost_projects
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

drop policy if exists "akuntan_data_owner" on public.akuntan_data;
create policy "akuntan_data_owner" on public.akuntan_data
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

drop policy if exists "field_logs_owner" on public.field_logs;
create policy "field_logs_owner" on public.field_logs
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

drop policy if exists "material_usage_owner" on public.material_usage;
create policy "material_usage_owner" on public.material_usage
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

drop policy if exists "material_requests_owner" on public.material_requests;
create policy "material_requests_owner" on public.material_requests
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- field_reports mengikuti kepemilikan field_logs
drop policy if exists "field_reports_owner_read" on public.field_reports;
create policy "field_reports_owner_read" on public.field_reports
  for select using (
    exists (select 1 from public.field_logs l where l.id = field_reports.log_id
            and (l.user_id = auth.uid() or public.is_team_member(l.user_id)))
  );
drop policy if exists "field_reports_owner_del" on public.field_reports;
create policy "field_reports_owner_del" on public.field_reports
  for delete using (
    exists (select 1 from public.field_logs l where l.id = field_reports.log_id
            and (l.user_id = auth.uid() or public.is_team_member(l.user_id)))
  );
