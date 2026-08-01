-- ============================================================
-- PropFS — Cari Leads: tautan pilihan sendiri
--
-- Tautan bawaan berupa 32 huruf acak: propfs.id/k/cb84437a91f2… Aman, tetapi
-- tidak ada yang mau mencetaknya di kartu nama, dan di gelembung WhatsApp ia
-- terpotong sehingga tidak terbaca. Sekarang pemiliknya bisa menggantinya
-- menjadi propfs.id/k/nexbuild.
--
-- INI AMAN HANYA UNTUK TAUTAN LEADS. Formnya memang dimaksudkan tersebar
-- seluas mungkin, jadi tautan yang mudah ditebak bukan kelemahan — justru itu
-- tujuannya. Tautan lain (surat jalan, PO, SPK, tanda tangan) membuka data
-- perusahaan kepada siapa pun yang memegangnya, dan token acaknya TIDAK boleh
-- diikutkan aturan ini.
--
-- Jalankan sekali di Supabase SQL Editor, SETELAH migration_leads.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

-- ── 1. Keunikan tanpa peduli huruf besar/kecil ──────────────────────────────
-- Pencocokan rute React Router tidak peka huruf besar: /k/NexBuild dan
-- /k/nexbuild membuka halaman yang sama. Menyimpan keduanya sebagai tautan
-- BERBEDA hanya menyiapkan kebingungan, jadi keunikannya ikut diukur
-- tanpa peduli huruf besar/kecil.
drop index if exists public.idx_company_leads_token;
create unique index if not exists idx_company_leads_token
  on public.company_profiles(lower(leads_token))
  where leads_token is not null and leads_token <> '';

-- ── 2. Aturan tautan, ditegakkan di server ──────────────────────────────────
-- Klien memeriksa hal yang sama (src/lib/leads.ts) supaya pemakainya tahu
-- lebih cepat, tetapi RPC bisa dipanggil langsung — jadi server tidak boleh
-- mempercayai klien.
create or replace function public.leads_slug_sah(p_slug text)
returns text
language plpgsql immutable set search_path = public as $$
declare s text;
begin
  s := lower(coalesce(trim(p_slug), ''));
  if s = '' then return 'Tautan belum diisi.'; end if;
  if length(s) < 3 then return 'Minimal 3 huruf atau angka.'; end if;
  if length(s) > 32 then return 'Maksimal 32 karakter.'; end if;
  if s !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then
    return 'Hanya huruf kecil, angka, dan tanda hubung.';
  end if;
  if s ~ '--' then return 'Tanda hubung tidak boleh berurutan.'; end if;
  if s ~ '^[0-9]+$' then
    return 'Jangan hanya angka — sertakan huruf agar mudah dikenali.';
  end if;
  if s in ('admin','api','app','www','form','leads','lead','new','baru',
           'edit','null','undefined','test','demo','propfs','login','daftar') then
    return format('"%s" sudah dipakai sistem. Coba yang lain.', s);
  end if;
  return null;   -- null berarti sah
end $$;

-- ── 3. Menetapkan tautan pilihan sendiri ────────────────────────────────────
-- Mengembalikan alasan yang bisa dibaca manusia, bukan sekadar gagal, karena
-- "sudah dipakai perusahaan lain" dan "hurufnya tidak boleh begitu" menuntut
-- tindakan yang berbeda dari pemakainya.
drop function if exists public.leads_token_set(text);
create or replace function public.leads_token_set(p_slug text)
returns table (ok boolean, alasan text, slug text)
language plpgsql security definer set search_path = public as $$
declare
  s text;
  salah text;
begin
  if auth.uid() is null then
    return query select false, 'Sesi tidak dikenali.'::text, ''::text;
    return;
  end if;

  s := lower(trim(coalesce(p_slug, '')));
  salah := public.leads_slug_sah(s);
  if salah is not null then
    return query select false, salah, s;
    return;
  end if;

  -- Sudah menjadi milik sendiri: dianggap berhasil, bukan bentrok. Menekan
  -- Simpan dua kali tidak boleh berbunyi seperti kegagalan.
  if exists (
    select 1 from company_profiles c
     where lower(c.leads_token) = s and c.user_id = auth.uid()
  ) then
    return query select true, ''::text, s;
    return;
  end if;

  if exists (
    select 1 from company_profiles c
     where lower(c.leads_token) = s and c.user_id <> auth.uid()
  ) then
    return query select false, 'Tautan ini sudah dipakai perusahaan lain.'::text, s;
    return;
  end if;

  insert into company_profiles (user_id, leads_token) values (auth.uid(), s)
    on conflict (user_id) do update set leads_token = excluded.leads_token;

  return query select true, ''::text, s;
exception
  -- Dua orang menyimpan tautan yang sama pada saat yang nyaris bersamaan:
  -- indeks unik yang memutuskan, dan yang kalah diberi tahu apa adanya.
  when unique_violation then
    return query select false, 'Tautan ini baru saja diambil orang lain.'::text, s;
end $$;

revoke all on function public.leads_slug_sah(text) from public;
revoke all on function public.leads_token_set(text) from public;
grant execute on function public.leads_slug_sah(text) to authenticated;
grant execute on function public.leads_token_set(text) to authenticated;

-- ── 4. Pencarian token ikut tidak peduli huruf besar/kecil ──────────────────
-- Tautan yang ditulis ulang seseorang dengan huruf kapital di awal harus tetap
-- membuka form yang sama. Kedua fungsi di bawah menggantikan versi di
-- migration_leads.sql; sisanya tidak berubah.
create or replace function public.leads_form_info(p_token text)
returns table (nama_perusahaan text, logo_url text, wa_official text)
language sql security definer stable set search_path = public as $$
  select coalesce(c.nama_perusahaan, ''), coalesce(c.logo_url, ''), coalesce(c.wa_official, '')
    from company_profiles c
   where lower(c.leads_token) = lower(coalesce(p_token, ''))
     and coalesce(p_token, '') <> '';
$$;

create or replace function public.leads_kirim(p_token text, p_data jsonb)
returns table (ok boolean, wa_official text)
language plpgsql security definer set search_path = public as $$
declare
  pemilik uuid;
  wa text;
  daftar_foto text[];
begin
  select c.user_id, coalesce(c.wa_official, '') into pemilik, wa
    from company_profiles c
   where lower(c.leads_token) = lower(coalesce(p_token, ''))
     and coalesce(p_token, '') <> '';
  if pemilik is null then
    return query select false, ''::text;
    return;
  end if;

  if coalesce(trim(p_data ->> 'nama'), '') = ''
     or coalesce(trim(p_data ->> 'no_hp'), '') = '' then
    return query select false, ''::text;
    return;
  end if;

  select array_agg(f) into daftar_foto
    from (
      select value::text as f
        from jsonb_array_elements_text(coalesce(p_data -> 'foto', '[]'::jsonb))
       limit 6
    ) t;

  insert into leads (
    user_id, nama, no_hp, email,
    jenis, lokasi, luas, kondisi, anggaran, target_mulai, catatan,
    foto, sumber
  ) values (
    pemilik,
    trim(p_data ->> 'nama'),
    trim(p_data ->> 'no_hp'),
    coalesce(trim(p_data ->> 'email'), ''),
    coalesce(trim(p_data ->> 'jenis'), ''),
    coalesce(trim(p_data ->> 'lokasi'), ''),
    coalesce(trim(p_data ->> 'luas'), ''),
    coalesce(trim(p_data ->> 'kondisi'), ''),
    coalesce(trim(p_data ->> 'anggaran'), ''),
    coalesce(trim(p_data ->> 'target_mulai'), ''),
    coalesce(trim(p_data ->> 'catatan'), ''),
    coalesce(daftar_foto, '{}'),
    coalesce(trim(p_data ->> 'sumber'), '')
  );

  return query select true, wa;
end $$;

revoke all on function public.leads_form_info(text) from public;
revoke all on function public.leads_kirim(text, jsonb) from public;
grant execute on function public.leads_form_info(text) to anon, authenticated;
grant execute on function public.leads_kirim(text, jsonb) to anon, authenticated;
