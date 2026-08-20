-- ============================================================
-- PropFS — Gambar Kerja & Denah
--
-- Gambar kerja beredar lewat WhatsApp. Akibatnya bukan sekadar berantakan:
-- tukang membuka gambar yang salah karena ia yang paling mudah ditemukan di
-- gulungan chat, dan yang dibangun mengikuti revisi yang sudah dicabut.
-- Kesalahan itu baru ketahuan setelah dicor.
--
-- Jadi yang dijaga tabel ini bukan "menyimpan berkas" — itu bagian mudahnya —
-- melainkan MANA YANG TERBARU.
--
-- Caranya: beberapa baris boleh memakai `nama` yang sama, masing-masing dengan
-- `versi` yang naik. Yang versinya tertinggi adalah yang berlaku; sisanya
-- riwayat yang tetap bisa dibuka. Tidak ada baris yang dihapus saat revisi
-- datang — gambar lama adalah satu-satunya cara menjelaskan kenapa yang
-- terlanjur dibangun berbentuk begitu.
--
-- BERKASNYA SENDIRI tidak disimpan di sini. Gambar kerja berukuran belasan
-- megabita; menaruhnya sebagai base64 di dalam baris — seperti yang dilakukan
-- foto lapangan di modul lain — akan membuat setiap pembacaan daftar menarik
-- seluruh isinya. Berkasnya di Supabase Storage; tabel ini hanya menunjuk.
--
-- Aman dijalankan berulang.
-- ============================================================

create table if not exists public.project_drawings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_name text not null default '',

  -- Identitas gambar, dipakai bersama oleh seluruh versinya.
  -- "Denah Lantai 1" versi 1, 2, 3 adalah tiga baris dengan nama yang sama.
  nama         text not null,
  kategori     text not null default 'arsitektur',
  versi        integer not null default 1,

  -- Letak berkas di Storage. Bukan URL: URL bertanda tangan kedaluwarsa,
  -- dan menyimpannya berarti menyimpan sesuatu yang akan berhenti berlaku.
  path         text not null,
  berkas_nama  text not null default '',
  mime         text not null default '',
  ukuran       bigint not null default 0,

  catatan      text not null default '',
  -- Apa yang berubah dari versi sebelumnya. Kosong pada versi pertama.
  perubahan    text not null default '',
  diunggah_oleh text not null default '',

  created_at   timestamptz not null default now()
);

alter table public.project_drawings enable row level security;

-- Satu nama tidak boleh punya dua versi bernomor sama dalam satu proyek.
-- Tanpa ini, dua orang yang mengunggah revisi bersamaan menghasilkan dua
-- "versi 3" — dan tidak ada cara mengetahui mana yang berlaku.
create unique index if not exists project_drawings_versi_unik
  on public.project_drawings (user_id, project_name, lower(btrim(nama)), versi);

create index if not exists project_drawings_proyek_idx
  on public.project_drawings (user_id, project_name, created_at desc);

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'project_drawings'
                   and policyname = 'drawings_all') then
    create policy drawings_all on public.project_drawings
      for all
      using (user_id = auth.uid() or public.is_team_member(user_id))
      with check (user_id = auth.uid() or public.is_team_member(user_id));
  end if;
end $$;

-- ── Storage ────────────────────────────────────────────────────────────────
--
-- Bucket PRIVAT. Gambar kerja memuat dimensi, detail struktur, dan sering nama
-- serta alamat pemiliknya; bucket publik berarti tautannya bisa ditebak dan
-- dibuka siapa pun tanpa akun.
--
-- Yang dipakai membukanya adalah URL bertanda tangan berumur pendek, dibuat
-- saat gambarnya diketuk.
insert into storage.buckets (id, name, public, file_size_limit)
values ('gambar-kerja', 'gambar-kerja', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- Nama objek diawali user_id pemilik workspace, jadi hak aksesnya bisa
-- diperiksa dari potongan pertama jalurnya tanpa membaca tabel mana pun.
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'gambar_kerja_baca') then
    create policy gambar_kerja_baca on storage.objects
      for select
      using (
        bucket_id = 'gambar-kerja'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_team_member(((storage.foldername(name))[1])::uuid)
        )
      );
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'gambar_kerja_tulis') then
    create policy gambar_kerja_tulis on storage.objects
      for insert
      with check (
        bucket_id = 'gambar-kerja'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_team_member(((storage.foldername(name))[1])::uuid)
        )
      );
  end if;

  -- Sengaja TIDAK ada policy hapus untuk anggota tim.
  --
  -- Menghapus berkas gambar kerja menghapus satu-satunya penjelasan atas apa
  -- yang sudah terlanjur dibangun. Revisi menambah versi, tidak mengganti
  -- yang lama — dan barisnya pun tidak dihapus. Pemilik workspace tetap bisa
  -- membersihkan lewat dashboard Supabase bila memang perlu.
end $$;
