-- ============================================================
-- PropFS — Kwitansi digital & kuota e-Meterai per perusahaan
--
-- Setelah penerimaan termin dicatat, yang ditunggu konsumen adalah buktinya.
-- Sampai sekarang bukti itu dibuat di luar sistem, sehingga angka di pembukuan
-- dan angka yang dipegang konsumen tidak pernah dijamin sama.
--
-- KUOTA METERAI DICATAT PER PERUSAHAAN, bukan per aplikasi. Meterai dibeli
-- oleh perusahaan penerbit dokumen atas namanya sendiri di distributor resmi
-- Peruri; kami hanya menghitung pemakaiannya dan menahan dokumen yang wajib
-- bermeterai agar tidak terkirim tanpa meterai.
--
-- Aman dijalankan berulang kali.
--
-- Jalankan di Supabase SQL Editor SETELAH:
--   migration_procurement.sql, migration_token_pendek.sql
-- ============================================================

create table if not exists public.kwitansi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nomor text not null default '',
  tanggal date not null default current_date,

  -- Entri pemasukan yang menjadi asalnya. Disimpan sebagai teks karena
  -- pemasukan hidup di store yang disinkronkan sebagai satu dokumen, bukan
  -- sebagai baris tabel — jadi tidak ada kunci asing yang bisa ditegakkan.
  pemasukan_id text default '',
  project_name text default '',

  penerima_dari text not null default '',
  penerima_wa text default '',
  untuk_pembayaran text not null default '',
  jumlah numeric not null default 0,
  metode text not null default 'transfer'
    check (metode in ('transfer', 'tunai', 'giro', 'lainnya')),
  catatan text default '',

  penanda_nama text default '',
  penanda_jabatan text default '',
  penanda_signature text,                  -- data URL PNG

  -- ── e-Meterai ──────────────────────────────────────────────────────────
  -- `perlu_materai` disimpan, tidak hanya dihitung dari `jumlah`.
  --
  -- Ambangnya bisa berubah bila undang-undangnya berubah, dan dokumen yang
  -- sudah terbit harus tetap mencatat kewajiban yang berlaku PADA SAAT ITU.
  -- Menghitung ulang dari nominal akan membuat kwitansi lama tiba-tiba
  -- "melanggar" atau "kelebihan" hanya karena aturannya bergeser.
  perlu_materai boolean not null default false,
  materai_status text not null default 'tidak_perlu'
    check (materai_status in ('tidak_perlu', 'menunggu', 'terbubuh', 'gagal')),
  materai_sn text default '',
  materai_at timestamptz,
  materai_galat text default '',

  view_token text not null unique default public.buat_token_pendek(12),
  terkirim_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists kwitansi_user_idx on public.kwitansi (user_id, created_at desc);

alter table public.kwitansi enable row level security;
drop policy if exists kwitansi_rw on public.kwitansi;
create policy kwitansi_rw on public.kwitansi
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- ── Kuota e-Meterai milik perusahaan ────────────────────────────────────────
create table if not exists public.materai_kuota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dibeli int not null default 0,
  terpakai int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.materai_kuota enable row level security;
drop policy if exists materai_kuota_rw on public.materai_kuota;
create policy materai_kuota_rw on public.materai_kuota
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- Buku besar pemakaian.
--
-- Angka saldo saja tidak bisa dipertanggungjawabkan: ketika sisa kuota tidak
-- cocok dengan yang dibeli, satu-satunya cara menemukan sebabnya adalah
-- riwayat tiap penambahan dan tiap pemakaian.
create table if not exists public.materai_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kwitansi_id uuid references public.kwitansi(id) on delete set null,
  jenis text not null check (jenis in ('beli', 'pakai', 'batal')),
  jumlah int not null default 1,
  catatan text default '',
  oleh text default '',
  created_at timestamptz not null default now()
);

create index if not exists materai_log_user_idx on public.materai_log (user_id, created_at desc);

alter table public.materai_log enable row level security;
drop policy if exists materai_log_rw on public.materai_log;
create policy materai_log_rw on public.materai_log
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- ── Menambah kuota yang sudah dibeli ────────────────────────────────────────
create or replace function public.materai_tambah_kuota(p_jumlah int, p_catatan text default '')
returns int language plpgsql security definer set search_path = public as $$
declare
  pemilik uuid := auth.uid();
  sisa int;
begin
  if pemilik is null or coalesce(p_jumlah, 0) <= 0 then return null; end if;

  insert into materai_kuota (user_id, dibeli) values (pemilik, p_jumlah)
  on conflict (user_id) do update
    set dibeli = materai_kuota.dibeli + excluded.dibeli, updated_at = now();

  insert into materai_log (user_id, jenis, jumlah, catatan)
  values (pemilik, 'beli', p_jumlah, left(coalesce(p_catatan, ''), 300));

  select dibeli - terpakai into sisa from materai_kuota where user_id = pemilik;
  return sisa;
end $$;

-- ── Memakai satu meterai ────────────────────────────────────────────────────
--
-- Memeriksa dan memakai DALAM SATU pernyataan. Bila dipisah menjadi "cek dulu,
-- kurangi kemudian", dua pembubuhan yang berjalan bersamaan sama-sama membaca
-- sisa yang lama dan kuotanya bisa terpakai melebihi yang dibeli — lalu
-- pembubuhan di sisi Peruri gagal setelah dokumennya terlanjur ditandai.
create or replace function public.materai_pakai(p_kwitansi_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  pemilik uuid;
  terpakai_baru int;
begin
  select user_id into pemilik from kwitansi
   where id = p_kwitansi_id
     and (user_id = auth.uid() or public.is_team_member(user_id));
  if pemilik is null then return false; end if;

  update materai_kuota
     set terpakai = terpakai + 1, updated_at = now()
   where user_id = pemilik and terpakai < dibeli
  returning terpakai into terpakai_baru;

  if terpakai_baru is null then return false; end if;

  insert into materai_log (user_id, kwitansi_id, jenis, jumlah)
  values (pemilik, p_kwitansi_id, 'pakai', 1);
  return true;
end $$;

-- Mengembalikan kuota ketika pembubuhan di sisi penyedia ternyata gagal.
-- Tanpa ini, tiap kegagalan jaringan memakan satu meterai yang sudah dibayar.
create or replace function public.materai_kembalikan(p_kwitansi_id uuid, p_sebab text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  pemilik uuid;
begin
  select user_id into pemilik from kwitansi
   where id = p_kwitansi_id
     and (user_id = auth.uid() or public.is_team_member(user_id));
  if pemilik is null then return false; end if;

  update materai_kuota set terpakai = greatest(0, terpakai - 1), updated_at = now()
   where user_id = pemilik;

  insert into materai_log (user_id, kwitansi_id, jenis, jumlah, catatan)
  values (pemilik, p_kwitansi_id, 'batal', 1, left(coalesce(p_sebab, ''), 300));
  return true;
end $$;

-- ── Yang dilihat konsumen lewat tautannya ───────────────────────────────────
--
-- Hanya kwitansi yang SUDAH DIKIRIM. Selama masih disiapkan, tautannya tidak
-- membuka apa pun — draft yang bocor lebih buruk daripada tautan yang belum
-- berlaku, sebab isinya bisa berubah setelah dibaca.
create or replace function public.kwitansi_by_token(p_token text)
returns table (
  nomor text, tanggal date, penerima_dari text, untuk_pembayaran text,
  jumlah numeric, metode text, project_name text, catatan text,
  penanda_nama text, penanda_jabatan text, penanda_signature text,
  materai_status text, materai_sn text,
  kop_nama text, kop_logo text, kop_kontak text
)
language sql security definer stable set search_path = public as $$
  select k.nomor, k.tanggal, k.penerima_dari, k.untuk_pembayaran,
         k.jumlah, k.metode, k.project_name, k.catatan,
         k.penanda_nama, k.penanda_jabatan, k.penanda_signature,
         k.materai_status, k.materai_sn,
         coalesce(c.nama_perusahaan, ''),
         coalesce(c.logo_url, ''),
         -- Baris kontak disusun di server supaya bagian yang kosong tidak
         -- meninggalkan pemisah "·" menggantung di kop. Sama seperti PO.
         array_to_string(
           array_remove(array[
             nullif(trim(coalesce(c.alamat, '')), ''),
             nullif(trim(coalesce(c.telepon, '')), ''),
             nullif(trim(coalesce(c.email, '')), ''),
             nullif(trim(coalesce(c.website, '')), '')
           ], null), ' · ')
  from kwitansi k
  left join company_profiles c on c.user_id = k.user_id
  where k.view_token = p_token
    and p_token is not null and length(p_token) >= 8
    and k.terkirim_at is not null
  limit 1;
$$;

revoke all on function public.kwitansi_by_token(text) from public;
revoke all on function public.materai_tambah_kuota(int, text) from public;
revoke all on function public.materai_pakai(uuid) from public;
revoke all on function public.materai_kembalikan(uuid, text) from public;

grant execute on function public.kwitansi_by_token(text) to anon, authenticated;
grant execute on function public.materai_tambah_kuota(int, text) to authenticated;
grant execute on function public.materai_pakai(uuid) to authenticated;
grant execute on function public.materai_kembalikan(uuid, text) to authenticated;
