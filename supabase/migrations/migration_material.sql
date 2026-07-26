-- ============================================================
-- PropFS — Kontraktor AI: Penggunaan Material & Request Material
-- Pekerja mengisi lewat LINK YANG SUDAH ADA (field_logs.report_token),
-- jadi tidak perlu membagikan link baru.
-- Admin/manajemen melihat & menyetujui dari dashboard.
-- Jalankan sekali di Supabase SQL Editor SETELAH migration_field_reports.sql.
-- ============================================================

-- ── Pemakaian material di lapangan ──────────────────────────────────────────
create table if not exists public.material_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id uuid references public.field_logs(id) on delete cascade,
  project_name text not null default '',
  tanggal date not null default current_date,
  nama text not null default '',
  satuan text not null default '',
  qty numeric not null default 0,
  lokasi text default '',           -- lokasi/zona pekerjaan
  pelapor text not null default '',
  catatan text default '',
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.material_usage enable row level security;
drop policy if exists "material_usage_owner" on public.material_usage;
create policy "material_usage_owner" on public.material_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Permintaan (request) material dari lapangan ─────────────────────────────
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id uuid references public.field_logs(id) on delete cascade,
  project_name text not null default '',
  tanggal date not null default current_date,
  nama text not null default '',
  satuan text not null default '',
  qty numeric not null default 0,
  urgensi text not null default 'normal'
    check (urgensi in ('normal', 'segera', 'darurat')),
  butuh_tanggal date,
  pemohon text not null default '',
  catatan text default '',
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'menunggu'
    check (status in ('menunggu', 'disetujui', 'ditolak', 'dibeli', 'diterima')),
  approver text default '',
  approved_at timestamptz,
  catatan_approval text default '',
  created_at timestamptz not null default now()
);

alter table public.material_requests enable row level security;
drop policy if exists "material_requests_owner" on public.material_requests;
create policy "material_requests_owner" on public.material_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_material_usage_user on public.material_usage(user_id, tanggal desc);
create index if not exists idx_material_requests_user on public.material_requests(user_id, status, tanggal desc);

-- ── Akses publik via token pekerja (tanpa login) — SECURITY DEFINER ─────────

-- Pekerja mencatat pemakaian material
create or replace function public.material_usage_submit(
  p_token text, p_tanggal date, p_pelapor text, p_nama text,
  p_satuan text, p_qty numeric, p_lokasi text, p_catatan text, p_photos jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_log uuid; v_user uuid; v_proj text;
begin
  select id, user_id, project_name into v_log, v_user, v_proj
    from field_logs where report_token = p_token;
  if v_log is null then return false; end if;
  if length(coalesce(p_pelapor, '')) < 2 then return false; end if;
  if length(coalesce(p_nama, '')) < 2 then return false; end if;
  if coalesce(p_qty, 0) <= 0 then return false; end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array' then return false; end if;

  insert into material_usage (user_id, log_id, project_name, tanggal, nama, satuan, qty, lokasi, pelapor, catatan, photos)
  values (v_user, v_log, v_proj, coalesce(p_tanggal, current_date), p_nama,
          coalesce(p_satuan, ''), p_qty, coalesce(p_lokasi, ''), p_pelapor,
          coalesce(p_catatan, ''), coalesce(p_photos, '[]'::jsonb));
  return true;
end;
$$;

-- Pekerja mengajukan permintaan material
create or replace function public.material_request_submit(
  p_token text, p_tanggal date, p_pemohon text, p_nama text,
  p_satuan text, p_qty numeric, p_urgensi text, p_butuh_tanggal date,
  p_catatan text, p_photos jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_log uuid; v_user uuid; v_proj text; v_urg text;
begin
  select id, user_id, project_name into v_log, v_user, v_proj
    from field_logs where report_token = p_token;
  if v_log is null then return false; end if;
  if length(coalesce(p_pemohon, '')) < 2 then return false; end if;
  if length(coalesce(p_nama, '')) < 2 then return false; end if;
  if coalesce(p_qty, 0) <= 0 then return false; end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array' then return false; end if;

  v_urg := case when p_urgensi in ('normal', 'segera', 'darurat') then p_urgensi else 'normal' end;

  insert into material_requests (user_id, log_id, project_name, tanggal, nama, satuan, qty,
                                 urgensi, butuh_tanggal, pemohon, catatan, photos)
  values (v_user, v_log, v_proj, coalesce(p_tanggal, current_date), p_nama,
          coalesce(p_satuan, ''), p_qty, v_urg, p_butuh_tanggal, p_pemohon,
          coalesce(p_catatan, ''), coalesce(p_photos, '[]'::jsonb));
  return true;
end;
$$;

-- Ringkasan untuk halaman pekerja: request terakhir yang dia ajukan di proyek ini
create or replace function public.material_by_report_token(p_token text)
returns table (usage jsonb, requests jsonb)
language sql security definer set search_path = public as $$
  select
    coalesce((
      select jsonb_agg(to_jsonb(u) order by u.tanggal desc, u.created_at desc)
      from material_usage u where u.log_id = l.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(to_jsonb(r) order by r.tanggal desc, r.created_at desc)
      from material_requests r where r.log_id = l.id
    ), '[]'::jsonb)
  from field_logs l where l.report_token = p_token;
$$;

revoke all on function public.material_usage_submit(text, date, text, text, text, numeric, text, text, jsonb) from public;
revoke all on function public.material_request_submit(text, date, text, text, text, numeric, text, date, text, jsonb) from public;
revoke all on function public.material_by_report_token(text) from public;
grant execute on function public.material_usage_submit(text, date, text, text, text, numeric, text, text, jsonb) to anon, authenticated;
grant execute on function public.material_request_submit(text, date, text, text, text, numeric, text, date, text, jsonb) to anon, authenticated;
grant execute on function public.material_by_report_token(text) to anon, authenticated;
