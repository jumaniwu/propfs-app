-- ============================================================
-- PropFS — Menggabungkan buku laporan yang terlanjur kembar
--
-- Satu proyek bisa berakhir dengan beberapa buku laporan: tombol "Buat Buku
-- Laporan" dulu tidak memeriksa apa pun, dan penjagaannya baru ditambahkan
-- belakangan di sisi aplikasi saja — sehingga dua orang yang menekannya di
-- dua perangkat tetap melahirkan dua buku.
--
-- Akibatnya tidak terlihat sebagai galat. Setiap buku punya link pekerjanya
-- sendiri, dan mandor yang menerima link berbeda mengisi ke buku berbeda.
-- Laporannya utuh, hanya terpecah — dan rekap absensi ikut terbelah,
-- sehingga upah dihitung dari separuh datanya.
--
-- EMPAT tabel menempel pada sebuah buku, dan keempatnya `on delete cascade`:
-- field_reports, material_usage, material_requests, field_workers. Karena itu
-- MENGHAPUS buku yang kembar tidak menyelesaikan apa pun — ia menghanguskan
-- isinya. Fungsi ini MEMINDAHKAN isi, lalu menghapus buku yang sudah kosong.
--
-- Dikerjakan di server dalam SATU transaksi. Penggabungan yang gagal separuh
-- jalan meninggalkan data terpecah dengan cara baru: sebagian laporan sudah
-- pindah, sebagian belum, dan tidak ada yang tahu mana yang mana. Itu lebih
-- buruk daripada sebelum dimulai.
--
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- Membutuhkan: migration_field_reports.sql, migration_material.sql,
--              migration_pekerja_lapangan.sql, migration_team.sql
-- ============================================================

create or replace function public.field_log_gabung(
  p_target uuid,
  p_sumber uuid[]
)
returns table (laporan_pindah int, pekerja_pindah int, buku_dihapus int)
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_nama text;
  v_lap int := 0;
  v_pkj int := 0;
  v_buku int := 0;
  v_sumber uuid[];
  v_lama uuid[] := '{}';
  v_baru uuid[] := '{}';
begin
  -- Pemilik buku target. Seluruh pemeriksaan hak bersandar padanya.
  select user_id, project_name into v_owner, v_nama
    from field_logs where id = p_target;
  if v_owner is null then
    raise exception 'Buku tujuan tidak ditemukan.';
  end if;

  -- HAK AKSES diperiksa di sini, bukan hanya di aplikasi. Fungsi ini
  -- `security definer`, jadi ia melewati RLS — tanpa pemeriksaan ini, siapa
  -- pun yang bisa memanggilnya bisa memindahkan laporan milik orang lain.
  if not (v_owner = auth.uid() or public.is_team_member(v_owner)) then
    raise exception 'Tidak berhak menggabungkan buku ini.';
  end if;

  -- Hanya buku milik pemilik yang SAMA yang boleh digabungkan, dan buku
  -- tujuan tidak boleh ikut menjadi sumber. Menggabungkan lintas pemilik akan
  -- memindahkan data antar perusahaan.
  select array_agg(id) into v_sumber
    from field_logs
   where id = any(p_sumber) and id <> p_target and user_id = v_owner;

  if v_sumber is null or array_length(v_sumber, 1) is null then
    return query select 0, 0, 0;
    return;
  end if;

  -- ── 1. Satukan identitas pekerja LEBIH DULU ────────────────────────────
  --
  -- Ini harus mendahului pemindahan laporan, dan alasannya adalah inti dari
  -- seluruh fungsi ini.
  --
  -- Absensi tidak menyimpan nama saja; tiap barisnya membawa `pekerja_id`,
  -- dan rekap upah mengelompokkan orang berdasarkan id itu. "Alpin" di buku A
  -- dan "Alpin" di buku B adalah dua baris field_workers dengan id berbeda.
  -- Kalau laporannya dipindahkan begitu saja, absensinya tetap menunjuk dua
  -- id — dan rekap upah tetap memecah satu orang menjadi dua, persis cacat
  -- yang hendak diperbaiki. Buku yang tergabung akan terlihat rapi sementara
  -- angka upahnya tetap salah: kegagalan yang tidak menampakkan diri.
  --
  -- Jadi id-nya yang disatukan, bukan hanya bukunya.
  if to_regclass('public.field_workers') is not null then
    -- Petanya disimpan sebagai DUA LARIK SEJAJAR, bukan tabel sementara.
    --
    -- Versi pertama memakai `create temp table` lalu `delete from peta;` untuk
    -- membersihkannya. DELETE itu tidak punya WHERE, dan Supabase memuat
    -- ekstensi `safeupdate` untuk peran `authenticator`: setiap DELETE atau
    -- UPDATE tanpa WHERE ditolak dengan "DELETE requires a WHERE clause".
    -- Seluruh penggabungan gagal di baris pembersihan yang bahkan bukan
    -- bagian dari pekerjaannya.
    --
    -- PostgreSQL biasa tidak memuat ekstensi itu, jadi cacatnya tidak muncul
    -- sama sekali saat diuji di luar Supabase. Larik menghapus persoalannya
    -- di akarnya: tidak ada DDL, tidak ada tabel yang perlu dibersihkan.
    with semua as (
      select w.id, lower(btrim(w.nama)) as k, w.created_at,
             (w.log_id = p_target) as di_target
        from field_workers w
       where w.log_id = p_target or w.log_id = any(v_sumber)
    ), utama as (
      -- Untuk tiap nama, satu id yang dipertahankan: yang sudah ada di buku
      -- tujuan, kalau tidak ada baru yang paling tua di antara buku sumber.
      select distinct on (k) k, id
        from semua
       order by k, di_target desc, created_at asc, id asc
    ), peta as (
      select s.id as old_id, u.id as new_id
        from semua s join utama u on u.k = s.k
       where s.id <> u.id
    )
    select coalesce(array_agg(old_id), '{}'), coalesce(array_agg(new_id), '{}')
      into v_lama, v_baru from peta;

    -- Pekerja yang id-nya dipertahankan dan masih berada di buku sumber
    -- dipindahkan. Yang tidak dipindahkan bukan dibuang begitu saja —
    -- absensinya sudah dialihkan ke id yang dipertahankan di langkah bawah,
    -- jadi yang hilang hanya baris daftarnya yang kembar.
    --
    -- Penyaring ini juga yang mencegah kegagalan keras: uq_field_workers_nama
    -- melarang dua nama sama dalam satu buku, dan memindahkan keduanya akan
    -- membatalkan SELURUH penggabungan di tengah jalan.
    update field_workers set log_id = p_target
     where log_id = any(v_sumber)
       and not (id = any(v_lama));
    get diagnostics v_pkj = row_count;
  end if;

  -- ── 2. Pindahkan isinya ────────────────────────────────────────────────
  update field_reports set log_id = p_target where log_id = any(v_sumber);
  get diagnostics v_lap = row_count;

  update material_usage
     set log_id = p_target,
         project_name = coalesce(v_nama, project_name)
   where log_id = any(v_sumber);

  update material_requests
     set log_id = p_target,
         project_name = coalesce(v_nama, project_name)
   where log_id = any(v_sumber);

  -- ── 3. Alihkan pekerja_id di dalam absensi ─────────────────────────────
  --
  -- Nama di dalam absensi sengaja TIDAK diubah. Ia salinan apa adanya dari
  -- hari itu, dan rekap yang berubah karena data induknya disunting adalah
  -- rekap yang tidak bisa dipertanggungjawabkan.
  if array_length(v_lama, 1) is not null then
    update field_reports r set absensi = (
      select jsonb_agg(
               case when m.new_id is not null
                 then jsonb_set(e.a, '{pekerja_id}', to_jsonb(m.new_id::text))
                 else e.a end
               order by e.ord)
        from jsonb_array_elements(r.absensi) with ordinality e(a, ord)
        left join unnest(v_lama, v_baru) as m(old_id, new_id)
               on m.old_id::text = (e.a->>'pekerja_id')
    )
    where r.log_id = p_target
      and jsonb_typeof(r.absensi) = 'array'
      and exists (
        -- Dibandingkan sebagai TEKS, bukan di-cast ke uuid. Absensi lama
        -- bisa membawa pekerja_id kosong atau bukan uuid sama sekali, dan
        -- cast yang gagal membatalkan seluruh penggabungan.
        select 1 from jsonb_array_elements(r.absensi) x, unnest(v_lama) l
         where l::text = (x->>'pekerja_id')
      );
  end if;

  -- ── 4. Buku yang sudah kosong dihapus ──────────────────────────────────
  --
  -- Pada titik ini isinya sudah pindah, jadi `on delete cascade` tidak lagi
  -- menghanguskan apa pun yang berharga. Yang tersisa hanya baris pekerja
  -- kembar yang absensinya sudah dialihkan.
  delete from field_logs where id = any(v_sumber);
  get diagnostics v_buku = row_count;

  return query select v_lap, v_pkj, v_buku;
end $$;

revoke all on function public.field_log_gabung(uuid, uuid[]) from public;
grant execute on function public.field_log_gabung(uuid, uuid[]) to authenticated;
