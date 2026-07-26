-- ============================================================
-- PropFS — Perbaikan hak akses anggota tim + kuota pengguna
--
-- MASALAH 1 (hak akses):
-- my_workspaces() hanya melihat tabel subscriptions, padahal aplikasi
-- memberi akses Kontraktor AI dari beberapa sumber: peran superadmin,
-- custom_features per pengguna, langganan aktif, masa uji coba, dan flag
-- fitur global saat sistem langganan dimatikan. Akibatnya perusahaan yang
-- sebenarnya berhak tetap dibaca sebagai 'free' dan seluruh anggota timnya
-- ditolak dengan pesan "Langganan Perusahaan Berakhir".
-- Sekarang fungsi ini mengembalikan `owner_akses boolean` yang dihitung
-- dari SEMUA sumber tersebut, meniru isFeatureEnabled() di aplikasi.
--
-- MASALAH 2 (kuota):
-- Belum ada batas jumlah anggota tim. Sekarang dibatasi 5 pengguna, bisa
-- ditambah dengan membeli slot (harga & batas dasar diatur di backend,
-- mengikuti pola add-on slot proyek yang sudah ada).
--
-- Jalankan sekali di Supabase SQL Editor, SETELAH migration_team_login.sql
-- ============================================================

-- ── 1. Slot pengguna tambahan ───────────────────────────────────────────────
alter table public.profiles
  add column if not exists addon_user_slots integer default 0;

-- Dipakai webhook pembayaran, sejalan dengan increment_addon_slots() lama.
create or replace function public.increment_addon_user_slots(uid uuid, jumlah integer default 1)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set addon_user_slots = coalesce(addon_user_slots, 0) + greatest(1, coalesce(jumlah, 1))
   where id = uid;
end $$;

-- Hanya webhook pembayaran (service_role) yang boleh menambah slot; pengguna
-- biasa tidak, supaya slot tidak bisa ditambah tanpa membayar.
revoke all on function public.increment_addon_user_slots(uuid, integer) from public;
grant execute on function public.increment_addon_user_slots(uuid, integer) to service_role;

-- Batas dasar & harga slot tambahan — diatur admin di menu Paket & Harga.
insert into public.app_settings (key, value) values
  ('max_team_users', '5'),
  ('addon_user_price', '50000')
on conflict (key) do nothing;

-- ── 2. Kuota tim milik pengguna yang sedang login ───────────────────────────
-- Satu panggilan mengembalikan semua yang dibutuhkan halaman Tim: batas
-- dasar dari app_settings, slot tambahan yang sudah dibeli, dan jumlah
-- anggota aktif saat ini.
create or replace function public.kuota_tim_saya()
returns table (batas_dasar integer, slot_tambahan integer, terpakai integer)
language sql security definer stable set search_path = public as $$
  select
    coalesce((select nullif(trim(both '"' from s.value::text), '')::int
              from app_settings s where s.key = 'max_team_users'), 5),
    coalesce((select p.addon_user_slots from profiles p where p.id = auth.uid()), 0),
    (select count(*)::int from team_members t
      where t.owner_id = auth.uid() and t.status <> 'nonaktif');
$$;

revoke all on function public.kuota_tim_saya() from public;
grant execute on function public.kuota_tim_saya() to authenticated;

-- ── 3. my_workspaces(): hak akses perusahaan dihitung menyeluruh ────────────
-- Bentuk hasil berubah lagi (tambah kolom owner_akses), jadi fungsi lama
-- harus dibuang dulu — Postgres menolak create or replace yang mengubah
-- daftar kolom (ERROR 42P13).
drop function if exists public.my_workspaces();

create or replace function public.my_workspaces()
returns table (
  owner_id uuid, nama text, perusahaan text, role text,
  kode text, owner_plan text, owner_plan_expires timestamptz,
  owner_trial_expires timestamptz, owner_akses boolean
)
language sql security definer stable set search_path = public as $$
  with pengaturan as (
    select
      coalesce((select (s.value::text = 'true' or s.value::text = '"true"')
                from app_settings s where s.key = 'subscription_enabled'), false) as langganan_aktif,
      coalesce((select (s.value::jsonb ->> 'cost_control') = 'true'
                from app_settings s where s.key = 'feature_flags'), false) as flag_global
  )
  select t.owner_id,
         coalesce(p.full_name, ''),
         coalesce(nullif(c.nama_perusahaan, ''), p.company, ''),
         t.role,
         coalesce(c.kode, ''),
         coalesce(sub.plan_id, 'free'),
         sub.expired_at,
         p.trial_expires_at,
         -- Urutan pemeriksaan sama dengan isFeatureEnabled() di aplikasi.
         (
           p.role = 'superadmin'
           or coalesce((p.custom_features ->> 'cost_control') = 'true', false)
           or (sub.plan_id is not null
               and (sub.expired_at is null or sub.expired_at > now()))
           or (p.trial_expires_at is not null and p.trial_expires_at > now())
           -- sistem langganan dimatikan → ikut flag fitur global
           or (not g.langganan_aktif and g.flag_global)
         ) as owner_akses
  from team_members t
  cross join pengaturan g
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
