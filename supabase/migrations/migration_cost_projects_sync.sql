-- ============================================================
-- PropFS — Kontraktor AI: sinkronisasi proyek & data akuntan
-- antar perangkat. Jalankan sekali di Supabase SQL Editor.
-- ============================================================

-- Proyek Kontraktor AI (RAB, material, realisasi) per user
create table if not exists public.cost_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,                 -- ProjectInfo.id dari aplikasi
  data jsonb not null,              -- SavedCostProject utuh
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.cost_projects enable row level security;
drop policy if exists "cost_projects_owner" on public.cost_projects;
create policy "cost_projects_owner" on public.cost_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Data modul Akuntan (pemasukan & penyesuaian inventori) per user
create table if not exists public.akuntan_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.akuntan_data enable row level security;
drop policy if exists "akuntan_data_owner" on public.akuntan_data;
create policy "akuntan_data_owner" on public.akuntan_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_cost_projects_user on public.cost_projects(user_id, updated_at desc);
