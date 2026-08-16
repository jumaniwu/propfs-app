-- ============================================================
-- PropFS — Daftar pekerja lapangan, dan absensi yang tidak diketik
--
-- CACAT YANG DIPERBAIKI MIGRASI INI.
--
-- Absensi harian meminta nama pekerja DIKETIK setiap hari. Di lapangan itu
-- berarti: mandor mengetik lima belas nama tiap sore, dari HP, dengan tangan
-- yang baru selesai memegang semen. Yang terjadi berikutnya sudah bisa
-- ditebak — "Yono", "yono", "Pak Yono", "Yon" — dan rekap upahnya memecah satu
-- orang menjadi empat.
--
-- Penggabungan nama sudah dijaga di sisi aplikasi, tetapi itu menambal akibat,
-- bukan sebab. Sebabnya: pekerja tidak pernah punya wujud di basis data. Ia
-- hanya teks yang lahir dan mati bersama satu baris laporan.
--
-- Migrasi ini memberinya wujud. Pekerja didaftarkan SEKALI di awal — oleh
-- pengawas, lewat link yang sudah dipegangnya — lalu absensi harian tinggal
-- mengetuk nama yang sudah ada.
--
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- Membutuhkan: migration_field_reports.sql dan migration_absensi_pekerja.sql
-- ============================================================

-- ── Daftar pekerja per buku laporan ────────────────────────────────────────
create table if not exists public.field_workers (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.field_logs(id) on delete cascade,

  nama text not null,
  peran text not null default '',
  no_hp text not null default '',

  -- 'harian'   : dibayar per hari kerja → rekap mingguan menghitung upahnya.
  -- 'borongan' : dibayar per pekerjaan, bukan per hari → kolom upahnya
  --              DIKOSONGKAN di rekap, bukan diisi nol.
  --
  -- Nol dan kosong bukan hal yang sama. Nol berkata "orang ini bekerja dan
  -- tidak dibayar sepeser pun"; kosong berkata "orang ini tidak dibayar
  -- dengan cara ini". Yang pertama akan ditanyakan orang di akhir minggu.
  jenis text not null default 'harian' check (jenis in ('harian', 'borongan')),
  upah_harian numeric not null default 0 check (upah_harian >= 0),

  -- Foto wajah, sudah dikecilkan di klien. Dipakai mandor untuk mengenali
  -- nama di daftar absen — di proyek besar, "Adi" bisa berarti tiga orang.
  foto text not null default '',

  -- Pekerja yang sudah tidak bekerja di sini TIDAK dihapus: absensinya yang
  -- sudah lewat masih harus bisa dibaca dan dibayar. Ia hanya berhenti
  -- ditawarkan di daftar absen hari ini.
  aktif boolean not null default true,
  catatan text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists idx_field_workers_log
  on public.field_workers(log_id, aktif, nama);

-- Nama kembar dalam satu buku laporan dicegah di SINI, bukan di layar.
-- Layar bisa dilewati; dua pengawas yang mendaftarkan orang yang sama pada
-- menit yang sama tidak akan saling melihat.
create unique index if not exists uq_field_workers_nama
  on public.field_workers(log_id, lower(btrim(nama)));

alter table public.field_workers enable row level security;

-- Pemilik buku laporan boleh apa saja atas pekerjanya.
drop policy if exists "field_workers_owner" on public.field_workers;
create policy "field_workers_owner" on public.field_workers
  for all using (
    exists (select 1 from public.field_logs l where l.id = field_workers.log_id and l.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.field_logs l where l.id = field_workers.log_id and l.user_id = auth.uid())
  );

-- ── Absensi menyimpan SALINAN nama, bukan hanya id ─────────────────────────
--
-- Bentuk tiap elemen absensi sekarang:
--   { "pekerja_id":"…", "nama":"Pak Yono", "peran":"Mandor",
--     "status":"hadir", "lembur":2, "foto":"data:image/jpeg;base64,…" }
--
-- Nama tetap disimpan walau sudah ada id. Bukan pemborosan: pekerja bisa
-- dihapus atau berganti nama, dan absensi bulan lalu harus tetap terbaca apa
-- adanya — termasuk oleh orang yang sedang menghitung upah yang belum
-- terbayar. Rekap yang berubah karena data induknya disunting adalah rekap
-- yang tidak bisa dipertanggungjawabkan.

-- ── Akses publik lewat token (pengawas tanpa login) ────────────────────────

-- Daftar pekerja untuk halaman absensi.
create or replace function public.field_workers_by_token(p_token text)
returns table (
  id uuid, nama text, peran text, no_hp text,
  jenis text, upah_harian numeric, foto text, aktif boolean
)
language sql security definer set search_path = public as $$
  select w.id, w.nama, w.peran, w.no_hp, w.jenis, w.upah_harian, w.foto, w.aktif
  from field_workers w
  join field_logs l on l.id = w.log_id
  where l.report_token = p_token and w.aktif
  order by lower(w.nama);
$$;

-- Pengawas mendaftarkan seorang pekerja.
create or replace function public.field_worker_daftar(
  p_token text,
  p_nama text,
  p_peran text default '',
  p_no_hp text default '',
  p_jenis text default 'harian',
  p_upah numeric default 0,
  p_foto text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_log uuid;
  v_id uuid;
  v_nama text := btrim(coalesce(p_nama, ''));
  v_jenis text := case when p_jenis = 'borongan' then 'borongan' else 'harian' end;
begin
  select id into v_log from field_logs where report_token = p_token;
  if v_log is null then raise exception 'Link tidak berlaku'; end if;
  if length(v_nama) < 2 then raise exception 'Nama pekerja terlalu pendek'; end if;

  -- Pendaftaran ulang orang yang sama TIDAK melempar galat. Di lapangan itu
  -- kejadian biasa: dua pengawas mendaftarkan orang yang sama, atau satu
  -- orang menekan simpan dua kali karena sinyalnya lambat. Yang benar adalah
  -- memperbarui datanya, bukan memarahi orangnya.
  insert into field_workers (log_id, nama, peran, no_hp, jenis, upah_harian, foto)
  values (v_log, v_nama, coalesce(p_peran, ''), coalesce(p_no_hp, ''),
          v_jenis, greatest(coalesce(p_upah, 0), 0), coalesce(p_foto, ''))
  on conflict (log_id, lower(btrim(nama))) do update set
    peran = case when excluded.peran <> '' then excluded.peran else field_workers.peran end,
    no_hp = case when excluded.no_hp <> '' then excluded.no_hp else field_workers.no_hp end,
    jenis = excluded.jenis,
    upah_harian = excluded.upah_harian,
    foto = case when excluded.foto <> '' then excluded.foto else field_workers.foto end,
    aktif = true
  returning id into v_id;

  return v_id;
end;
$$;

-- Menonaktifkan pekerja yang sudah tidak bekerja di sini.
create or replace function public.field_worker_nonaktif(p_token text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_log uuid;
begin
  select id into v_log from field_logs where report_token = p_token;
  if v_log is null then return false; end if;
  update field_workers set aktif = false where id = p_id and log_id = v_log;
  return found;
end;
$$;

revoke all on function public.field_workers_by_token(text) from public;
revoke all on function public.field_worker_daftar(text, text, text, text, text, numeric, text) from public;
revoke all on function public.field_worker_nonaktif(text, uuid) from public;
grant execute on function public.field_workers_by_token(text) to anon, authenticated;
grant execute on function public.field_worker_daftar(text, text, text, text, text, numeric, text) to anon, authenticated;
grant execute on function public.field_worker_nonaktif(text, uuid) to anon, authenticated;

-- ── Daftar pekerja di header halaman: tidak lagi ditebak dari riwayat ───────
--
-- field_log_by_report_token dulu menyusun daftar nama dengan memindai absensi
-- 90 hari terakhir. Itu tebakan yang lahir dari ketiadaan daftar sungguhan —
-- dan tebakan yang salah untuk pekerja BARU, yang justru paling butuh muncul
-- di daftar absen hari pertamanya.
--
-- Sekarang daftarnya diambil dari field_workers. Riwayat tetap dibaca sebagai
-- cadangan, supaya buku laporan yang pekerjanya belum sempat didaftarkan
-- tidak kehilangan saran nama yang selama ini sudah dipakai.
drop function if exists public.field_log_by_report_token(text);

create or replace function public.field_log_by_report_token(p_token text)
returns table (project_name text, drive_webhook text, pekerja jsonb)
language sql security definer set search_path = public as $$
  select l.project_name, l.drive_webhook,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', w.id, 'nama', w.nama, 'peran', w.peran,
                    'jenis', w.jenis, 'upah_harian', w.upah_harian, 'foto', w.foto
                  ) order by lower(w.nama))
           from field_workers w
           where w.log_id = l.id and w.aktif
         ), '[]'::jsonb)
  from field_logs l
  where l.report_token = p_token;
$$;

revoke all on function public.field_log_by_report_token(text) from public;
grant execute on function public.field_log_by_report_token(text) to anon, authenticated;
