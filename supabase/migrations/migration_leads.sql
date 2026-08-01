-- ============================================================
-- PropFS — Kontraktor AI: Cari Leads
--
-- Calon konsumen yang mencari kontraktor renovasi selama ini masuk lewat DM
-- WhatsApp: datanya tercecer di gelembung chat, tidak ada yang tahu berapa
-- banyak yang masuk bulan ini, dan yang belum sempat dibalas menghilang begitu
-- saja tertimbun percakapan lain.
--
-- Di sini perusahaan punya SATU tautan form yang bisa disebar di mana pun
-- (bio Instagram, iklan, kartu nama). Calon konsumen mengisinya tanpa login,
-- datanya masuk ke daftar yang bisa ditindaklanjuti, dan ia langsung diantar
-- ke WhatsApp official perusahaan dengan pesan yang sudah terisi.
--
-- Perhatikan urutannya: DISIMPAN DULU, baru diantar ke WhatsApp. Kalau
-- urutannya dibalik, calon yang menutup WhatsApp tanpa mengirim pesan akan
-- hilang tanpa jejak — padahal ia sudah menyerahkan datanya.
--
-- Jalankan sekali di Supabase SQL Editor, SETELAH migration_company_profile.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

-- ── 1. Tautan form & nomor WhatsApp official ────────────────────────────────
-- Token dipisah dari vendor_token: keduanya disebar ke orang yang berbeda dan
-- harus bisa diputar ulang sendiri-sendiri bila salah satunya bocor.
alter table public.company_profiles
  add column if not exists leads_token text,
  add column if not exists wa_official text default '';

create unique index if not exists idx_company_leads_token
  on public.company_profiles(leads_token) where leads_token is not null;

-- ── 2. Leads ────────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Data diri. Hanya nama & no_hp yang benar-benar wajib: memaksa email
  -- membuat sebagian calon berhenti mengisi, dan calon yang berhenti mengisi
  -- jauh lebih mahal daripada satu kolom yang kosong.
  nama text not null default '',
  no_hp text not null default '',
  email text not null default '',

  -- Data proyek yang ingin dikerjakan.
  jenis text not null default '',        -- renovasi rumah / ruko / interior / bangun baru
  lokasi text not null default '',
  luas text not null default '',         -- teks bebas: calon sering menjawab "sekitar 100an"
  kondisi text not null default '',      -- keadaan bangunan saat ini
  anggaran text not null default '',     -- juga teks bebas, sering berupa rentang
  target_mulai text not null default '',
  catatan text not null default '',

  -- Foto kondisi bangunan (data URL, sudah dikecilkan di klien). Opsional.
  foto text[] not null default '{}',

  -- Tahapan tindak lanjut. Sengaja sedikit: pipeline yang terlalu rinci
  -- tidak pernah diperbarui, dan pipeline yang tidak diperbarui menipu.
  status text not null default 'baru'
    check (status in ('baru', 'dihubungi', 'survei', 'penawaran', 'deal', 'batal')),
  catatan_internal text not null default '',

  -- Dari mana tautannya dibuka, bila pemasarnya menandai tautannya
  -- (mis. /L/xxxx?dari=instagram). Berguna untuk tahu iklan mana yang jalan.
  sumber text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_user on public.leads(user_id, created_at desc);
create index if not exists idx_leads_status on public.leads(user_id, status);

-- ── 3. RLS: pemilik + anggota tim aktif ─────────────────────────────────────
-- Tidak ada policy INSERT untuk pengguna login: leads masuk lewat RPC
-- security definer di bawah, karena pengirimnya justru orang yang TIDAK login.
alter table public.leads enable row level security;

drop policy if exists "leads_owner" on public.leads;
create policy "leads_owner" on public.leads
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- ── 4. Halaman form publik ──────────────────────────────────────────────────
-- Yang dibuka ke anon hanya yang memang perlu dicetak di halaman formnya:
-- nama, logo, dan nomor WhatsApp yang toh akan dituju calon konsumen.
-- Alamat, NPWP, email, dan telepon kantor TIDAK ikut.
create or replace function public.leads_form_info(p_token text)
returns table (nama_perusahaan text, logo_url text, wa_official text)
language sql security definer stable set search_path = public as $$
  select coalesce(c.nama_perusahaan, ''), coalesce(c.logo_url, ''), coalesce(c.wa_official, '')
    from company_profiles c
   where c.leads_token = p_token
     and coalesce(p_token, '') <> '';
$$;

-- Menyimpan lead dari form publik.
--
-- Mengembalikan nomor WhatsApp tujuan supaya klien bisa langsung mengantar
-- calonnya ke sana — dan mengembalikannya HANYA setelah barisnya tersimpan.
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
   where c.leads_token = p_token and coalesce(p_token, '') <> '';
  if pemilik is null then
    return query select false, ''::text;
    return;
  end if;

  -- Nama & nomor HP wajib: tanpa keduanya lead ini tidak bisa dihubungi, dan
  -- baris yang tidak bisa ditindaklanjuti hanya mengotori daftar.
  if coalesce(trim(p_data ->> 'nama'), '') = ''
     or coalesce(trim(p_data ->> 'no_hp'), '') = '' then
    return query select false, ''::text;
    return;
  end if;

  -- Foto dibatasi di server juga, bukan hanya di klien: form publik bisa
  -- dipanggil langsung, dan tanpa batas ini satu kiriman bisa membesar
  -- tanpa henti.
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

-- ── 5. Tautan form milik pengguna yang sedang login ─────────────────────────
-- Dibuatkan saat pertama diminta, dan TIDAK diputar ulang bila sudah ada —
-- tautan yang berubah sendiri akan mematikan yang sudah tercetak di kartu nama.
create or replace function public.leads_token_saya()
returns text language plpgsql security definer set search_path = public as $$
declare hasil text;
begin
  if auth.uid() is null then return null; end if;

  select c.leads_token into hasil from company_profiles c where c.user_id = auth.uid();
  if hasil is not null and hasil <> '' then return hasil; end if;

  hasil := replace(gen_random_uuid()::text, '-', '');
  insert into company_profiles (user_id, leads_token) values (auth.uid(), hasil)
    on conflict (user_id) do update set leads_token = excluded.leads_token
    where company_profiles.leads_token is null or company_profiles.leads_token = '';

  select c.leads_token into hasil from company_profiles c where c.user_id = auth.uid();
  return hasil;
end $$;

-- Memutar ulang tautan, dipakai bila tautannya terlanjur tersebar salah.
create or replace function public.leads_token_ganti()
returns text language plpgsql security definer set search_path = public as $$
declare hasil text;
begin
  if auth.uid() is null then return null; end if;
  hasil := replace(gen_random_uuid()::text, '-', '');
  insert into company_profiles (user_id, leads_token) values (auth.uid(), hasil)
    on conflict (user_id) do update set leads_token = excluded.leads_token;
  return hasil;
end $$;

revoke all on function public.leads_token_saya() from public;
revoke all on function public.leads_token_ganti() from public;
grant execute on function public.leads_token_saya() to authenticated;
grant execute on function public.leads_token_ganti() to authenticated;

-- ── 6. updated_at ikut bergerak saat status diubah ──────────────────────────
create or replace function public.leads_sentuh()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_leads_sentuh on public.leads;
create trigger trg_leads_sentuh before update on public.leads
  for each row execute function public.leads_sentuh();
