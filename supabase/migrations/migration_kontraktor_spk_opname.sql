-- ============================================================
-- PropFS — Kontraktor AI: SPK digital + Form Opname via link
-- Jalankan sekali di Supabase SQL Editor.
-- ============================================================

-- ── Tabel SPK (Surat Perintah Kerja) ────────────────────────
create table if not exists public.spk_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nomor text not null,
  project_name text not null default '',
  vendor_name text not null,
  vendor_email text default '',
  vendor_wa text default '',
  lingkup jsonb not null default '[]'::jsonb,      -- [{uraian, volume, satuan, harga}]
  nilai_kontrak numeric not null default 0,
  termin jsonb not null default '[]'::jsonb,        -- [{nama, pct}]
  tgl_mulai date,
  durasi_hari int default 0,
  denda_permil numeric default 1,
  catatan text default '',
  status text not null default 'draft',             -- draft | terkirim | ditandatangani
  sign_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  signature_data text,                              -- data URL PNG tanda tangan
  signed_name text,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.spk_docs enable row level security;

drop policy if exists "spk_owner_all" on public.spk_docs;
create policy "spk_owner_all" on public.spk_docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Tabel Form Opname (diisi tukang/mandor via link) ────────
create table if not exists public.opname_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  judul text not null,
  project_name text not null default '',
  tanggal date not null default current_date,
  petugas text default '',
  items jsonb not null default '[]'::jsonb,         -- [{uraian, satuan, vol_rencana, vol_realisasi, catatan}]
  status text not null default 'terbuka',           -- terbuka | terisi | disetujui
  fill_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  filled_by text,
  filled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.opname_forms enable row level security;

drop policy if exists "opname_owner_all" on public.opname_forms;
create policy "opname_owner_all" on public.opname_forms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Akses publik via token (tanpa login) — SECURITY DEFINER ──
create or replace function public.spk_get_by_token(p_token text)
returns table (
  nomor text, project_name text, vendor_name text,
  lingkup jsonb, nilai_kontrak numeric, termin jsonb,
  tgl_mulai date, durasi_hari int, denda_permil numeric, catatan text,
  status text, signature_data text, signed_name text, signed_at timestamptz,
  created_at timestamptz
) language sql security definer set search_path = public as $$
  select nomor, project_name, vendor_name, lingkup, nilai_kontrak, termin,
         tgl_mulai, durasi_hari, denda_permil, catatan,
         status, signature_data, signed_name, signed_at, created_at
  from spk_docs where sign_token = p_token;
$$;

create or replace function public.spk_sign_by_token(p_token text, p_signature text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update spk_docs
     set signature_data = p_signature,
         signed_name = p_name,
         signed_at = now(),
         status = 'ditandatangani'
   where sign_token = p_token
     and status <> 'ditandatangani'
     and length(coalesce(p_signature, '')) between 100 and 500000
     and length(coalesce(p_name, '')) between 2 and 120;
  return found;
end;
$$;

create or replace function public.opname_get_by_token(p_token text)
returns table (
  judul text, project_name text, tanggal date, petugas text,
  items jsonb, status text, filled_by text, filled_at timestamptz
) language sql security definer set search_path = public as $$
  select judul, project_name, tanggal, petugas, items, status, filled_by, filled_at
  from opname_forms where fill_token = p_token;
$$;

create or replace function public.opname_fill_by_token(p_token text, p_items jsonb, p_by text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update opname_forms
     set items = p_items,
         filled_by = p_by,
         filled_at = now(),
         status = 'terisi'
   where fill_token = p_token
     and status <> 'disetujui'
     and jsonb_typeof(p_items) = 'array'
     and length(coalesce(p_by, '')) between 2 and 120;
  return found;
end;
$$;

revoke all on function public.spk_get_by_token(text) from public;
revoke all on function public.spk_sign_by_token(text, text, text) from public;
revoke all on function public.opname_get_by_token(text) from public;
revoke all on function public.opname_fill_by_token(text, jsonb, text) from public;
grant execute on function public.spk_get_by_token(text) to anon, authenticated;
grant execute on function public.spk_sign_by_token(text, text, text) to anon, authenticated;
grant execute on function public.opname_get_by_token(text) to anon, authenticated;
grant execute on function public.opname_fill_by_token(text, jsonb, text) to anon, authenticated;

create index if not exists idx_spk_user on public.spk_docs(user_id, created_at desc);
create index if not exists idx_opname_user on public.opname_forms(user_id, created_at desc);
