-- ============================================================
-- PropFS — Kontraktor AI: Laporan Harian Lapangan
-- 1 link untuk PEKERJA upload laporan harian (kerja apa, progress, foto)
-- 1 link untuk OWNER melihat kalender progress lapangan.
-- Jalankan sekali di Supabase SQL Editor.
-- ============================================================

-- Satu "buku laporan" per proyek (punya 2 token: upload & lihat)
create table if not exists public.field_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null default '',
  drive_webhook text default '',
  report_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  view_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

alter table public.field_logs enable row level security;
drop policy if exists "field_logs_owner" on public.field_logs;
create policy "field_logs_owner" on public.field_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Laporan harian (diisi pekerja via link, tanpa login)
create table if not exists public.field_reports (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.field_logs(id) on delete cascade,
  tanggal date not null default current_date,
  pelapor text not null default '',
  kegiatan jsonb not null default '[]'::jsonb,   -- array string kegiatan
  catatan text default '',
  photos jsonb not null default '[]'::jsonb,      -- array data URL (dikecilkan)
  created_at timestamptz not null default now()
);

alter table public.field_reports enable row level security;
-- Owner boleh baca laporan miliknya (via kepemilikan field_logs)
drop policy if exists "field_reports_owner_read" on public.field_reports;
create policy "field_reports_owner_read" on public.field_reports
  for select using (
    exists (select 1 from public.field_logs l where l.id = field_reports.log_id and l.user_id = auth.uid())
  );
drop policy if exists "field_reports_owner_del" on public.field_reports;
create policy "field_reports_owner_del" on public.field_reports
  for delete using (
    exists (select 1 from public.field_logs l where l.id = field_reports.log_id and l.user_id = auth.uid())
  );

create index if not exists idx_field_logs_user on public.field_logs(user_id, created_at desc);
create index if not exists idx_field_reports_log on public.field_reports(log_id, tanggal desc);

-- ── Akses publik via token (tanpa login) — SECURITY DEFINER ──

-- Header untuk halaman upload pekerja
create or replace function public.field_log_by_report_token(p_token text)
returns table (project_name text, drive_webhook text)
language sql security definer set search_path = public as $$
  select project_name, drive_webhook from field_logs where report_token = p_token;
$$;

-- Pekerja mengirim laporan harian
create or replace function public.field_report_submit(
  p_token text, p_tanggal date, p_pelapor text,
  p_kegiatan jsonb, p_catatan text, p_photos jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_log uuid;
begin
  select id into v_log from field_logs where report_token = p_token;
  if v_log is null then return false; end if;
  if length(coalesce(p_pelapor, '')) < 2 then return false; end if;
  if jsonb_typeof(p_kegiatan) <> 'array' or jsonb_typeof(p_photos) <> 'array' then return false; end if;
  insert into field_reports (log_id, tanggal, pelapor, kegiatan, catatan, photos)
  values (v_log, coalesce(p_tanggal, current_date), p_pelapor,
          p_kegiatan, coalesce(p_catatan, ''), p_photos);
  return true;
end;
$$;

-- Owner melihat seluruh laporan (kalender) via link lihat
create or replace function public.field_log_by_view_token(p_token text)
returns table (project_name text, reports jsonb)
language sql security definer set search_path = public as $$
  select l.project_name,
         coalesce((
           select jsonb_agg(to_jsonb(r) order by r.tanggal desc, r.created_at desc)
           from field_reports r where r.log_id = l.id
         ), '[]'::jsonb)
  from field_logs l where l.view_token = p_token;
$$;

revoke all on function public.field_log_by_report_token(text) from public;
revoke all on function public.field_report_submit(text, date, text, jsonb, text, jsonb) from public;
revoke all on function public.field_log_by_view_token(text) from public;
grant execute on function public.field_log_by_report_token(text) to anon, authenticated;
grant execute on function public.field_report_submit(text, date, text, jsonb, text, jsonb) to anon, authenticated;
grant execute on function public.field_log_by_view_token(text) to anon, authenticated;
