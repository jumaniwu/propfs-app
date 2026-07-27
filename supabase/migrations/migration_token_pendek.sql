-- ============================================================
-- PropFS — Token tautan publik versi pendek
--
-- Tautan yang dibagikan lewat WhatsApp dulu memakai UUID tanpa tanda hubung:
-- 32 karakter heksadesimal. Digabung jalur panjang seperti /vendor/daftar/,
-- satu tautan bisa 68 karakter dan terpotong di gelembung chat.
--
-- Migrasi ini mengganti NILAI BAWAAN kolom token menjadi 12 karakter dari
-- alfabet tanpa 0/O dan 1/I/L. Baris yang sudah ada SENGAJA TIDAK DISENTUH:
-- vendor dan pekerja yang sudah menyimpan tautannya tidak perlu dikirimi
-- ulang, dan aplikasi tetap menerima kedua bentuk token.
--
-- Aman dijalankan berulang kali.
--
-- Jalankan di Supabase SQL Editor SETELAH:
--   migration_field_reports.sql, migration_kontraktor_spk_opname.sql,
--   migration_procurement.sql
-- ============================================================

-- ── Pembuat token ───────────────────────────────────────────────────────────
-- 12 karakter dari 31 huruf ≈ 59 bit. Keunikan tidak diperiksa di sini karena
-- fungsi ini dipakai sebagai DEFAULT kolom dan tidak tahu tabel pemanggilnya;
-- yang menjamin adalah batasan unique pada tiap kolom. Pada 59 bit, peluang
-- tabrakan bahkan setelah jutaan baris masih di bawah satu per sejuta.
create or replace function public.buat_token_pendek(p_panjang int default 12)
returns text language plpgsql volatile set search_path = public as $$
declare
  huruf constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  hasil text := '';
  i int;
  n int := greatest(8, coalesce(p_panjang, 12));
begin
  for i in 1..n loop
    hasil := hasil || substr(huruf, 1 + floor(random() * length(huruf))::int, 1);
  end loop;
  return hasil;
end $$;

revoke all on function public.buat_token_pendek(int) from public;
grant execute on function public.buat_token_pendek(int) to authenticated, service_role;

-- ── Nilai bawaan kolom token ────────────────────────────────────────────────
-- Hanya berlaku untuk baris baru. `alter column ... set default` tidak menulis
-- ulang baris yang sudah ada, jadi token lama tetap utuh.
do $do$
declare
  r record;
begin
  for r in
    select * from (values
      ('field_logs',      'report_token'),
      ('field_logs',      'view_token'),
      ('spk_docs',        'sign_token'),
      ('opname_forms',    'fill_token'),
      ('vendors',         'self_token'),
      ('purchase_orders', 'view_token')
    ) as v(tabel, kolom)
  loop
    -- Lewati tabel/kolom yang belum ada supaya migrasi ini tidak memaksa
    -- urutan tertentu bila salah satu modul belum dipasang.
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = r.tabel
        and c.column_name = r.kolom
    ) then
      execute format(
        'alter table public.%I alter column %I set default public.buat_token_pendek()',
        r.tabel, r.kolom);
    end if;
  end loop;
end
$do$;

-- ── Tautan registrasi vendor per perusahaan ─────────────────────────────────
-- company_profiles.vendor_token diisi lewat RPC, bukan default kolom, jadi
-- fungsinya ikut diperbarui. Perusahaan yang sudah punya token tetap memakai
-- yang lama — tautan yang sudah tersebar tidak boleh berubah diam-diam.
create or replace function public.vendor_token_saya()
returns text language plpgsql security definer set search_path = public as $$
declare hasil text;
begin
  if auth.uid() is null then return null; end if;

  select c.vendor_token into hasil from company_profiles c where c.user_id = auth.uid();
  if hasil is not null and hasil <> '' then return hasil; end if;

  hasil := public.buat_token_pendek();
  insert into company_profiles (user_id, vendor_token) values (auth.uid(), hasil)
    on conflict (user_id) do update set vendor_token = excluded.vendor_token
    where company_profiles.vendor_token is null or company_profiles.vendor_token = '';

  select c.vendor_token into hasil from company_profiles c where c.user_id = auth.uid();
  return hasil;
end $$;

revoke all on function public.vendor_token_saya() from public;
grant execute on function public.vendor_token_saya() to authenticated;

-- ── Memutar ulang tautan yang bocor ─────────────────────────────────────────
-- Tautan registrasi vendor bersifat publik; bila tersebar ke pihak yang tidak
-- diinginkan, pemilik bisa menerbitkan yang baru. Tautan lama langsung mati.
create or replace function public.vendor_token_putar_ulang()
returns text language plpgsql security definer set search_path = public as $$
declare hasil text;
begin
  if auth.uid() is null then return null; end if;
  hasil := public.buat_token_pendek();
  insert into company_profiles (user_id, vendor_token) values (auth.uid(), hasil)
    on conflict (user_id) do update set vendor_token = excluded.vendor_token;
  return hasil;
end $$;

revoke all on function public.vendor_token_putar_ulang() from public;
grant execute on function public.vendor_token_putar_ulang() to authenticated;
