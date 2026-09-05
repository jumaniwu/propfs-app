-- ============================================================
-- PropFS — Buku laporan milik PERUSAHAAN, bukan milik yang membuatnya
--
-- CACAT YANG DIPERBAIKI MIGRASI INI.
--
-- RLS pada field_logs berbunyi `auth.uid() = user_id or is_team_member(user_id)`,
-- dan `is_team_member(p_owner)` hanya berlaku SATU ARAH: ia menjawab "apakah
-- saya anggota tim si pemilik". Tidak ada arah sebaliknya.
--
-- Jadi ketika pengawas menekan "Buat Buku Laporan", bukunya tersimpan atas
-- namanya sendiri. Ia melihatnya. Pemilik perusahaan TIDAK — karena pemilik
-- bukan anggota tim pengawasnya. Laporan harian, absensi, dan catatan material
-- yang masuk lewat buku itu hilang dari pandangan orang yang paling
-- membutuhkannya, dan tidak ada satu pun pesan galat sepanjang jalan.
--
-- Aplikasinya sudah diperbaiki: buku baru disimpan atas nama pemilik
-- workspace. Migrasi ini membereskan yang TERLANJUR dibuat.
--
-- YANG TIDAK DISENTUH, dan sebabnya:
--
-- Baris yang pembuatnya anggota di LEBIH DARI SATU perusahaan dibiarkan apa
-- adanya. Menebak perusahaan mana yang dimaksud berarti memindahkan laporan
-- lapangan sebuah proyek ke perusahaan yang salah — dan orang di sana akan
-- melihat data yang bukan haknya. Lebih baik satu buku tetap tidak terlihat
-- daripada satu buku terlihat oleh perusahaan lain.
--
-- Jumlah keduanya dilaporkan di akhir, jadi tidak ada yang diam-diam
-- dilewatkan.
--
-- Jalankan sekali di Supabase SQL Editor. Aman diulang: yang sudah benar
-- tidak ikut tersentuh.
-- Membutuhkan: migration_team.sql, migration_field_reports.sql
-- ============================================================

do $$
declare
  v_buku int := 0;
  v_pakai int := 0;
  v_minta int := 0;
  v_ragu int := 0;
begin
  -- Pembuat yang keanggotaannya TUNGGAL — hanya mereka yang dialihkan.
  -- Ditulis sebagai subkueri, bukan tabel sementara: DDL di dalam migrasi
  -- yang dijalankan berulang menambah cara gagal yang tidak ada gunanya.
  update field_logs l set user_id = p.pemilik
    from (
      select t.member_user_id as anggota, (array_agg(distinct t.owner_id))[1] as pemilik
        from team_members t
       where t.status = 'aktif' and t.member_user_id is not null
         -- Yang memiliki workspace sendiri tidak pernah dialihkan, walau ia
         -- juga menjadi anggota di perusahaan lain.
         and not exists (select 1 from team_members o where o.owner_id = t.member_user_id)
       group by t.member_user_id
      having count(distinct t.owner_id) = 1
    ) p
   where l.user_id = p.anggota;
  get diagnostics v_buku = row_count;

  -- material_usage & material_requests menyimpan user_id-nya SENDIRI, tidak
  -- ikut lewat field_logs, jadi keduanya harus dialihkan terpisah. Kalau
  -- tidak, bukunya terlihat oleh pemilik tetapi catatan materialnya tidak.
  update material_usage m set user_id = p.pemilik
    from (
      select t.member_user_id as anggota, (array_agg(distinct t.owner_id))[1] as pemilik
        from team_members t
       where t.status = 'aktif' and t.member_user_id is not null
         -- Yang memiliki workspace sendiri tidak pernah dialihkan, walau ia
         -- juga menjadi anggota di perusahaan lain.
         and not exists (select 1 from team_members o where o.owner_id = t.member_user_id)
       group by t.member_user_id
      having count(distinct t.owner_id) = 1
    ) p
   where m.user_id = p.anggota;
  get diagnostics v_pakai = row_count;

  update material_requests m set user_id = p.pemilik
    from (
      select t.member_user_id as anggota, (array_agg(distinct t.owner_id))[1] as pemilik
        from team_members t
       where t.status = 'aktif' and t.member_user_id is not null
         -- Yang memiliki workspace sendiri tidak pernah dialihkan, walau ia
         -- juga menjadi anggota di perusahaan lain.
         and not exists (select 1 from team_members o where o.owner_id = t.member_user_id)
       group by t.member_user_id
      having count(distinct t.owner_id) = 1
    ) p
   where m.user_id = p.anggota;
  get diagnostics v_minta = row_count;

  -- Yang sengaja dilewatkan, dihitung supaya tidak ada yang diam-diam hilang.
  select count(*) into v_ragu
    from field_logs l
   where l.user_id in (
     select t.member_user_id from team_members t
      where t.status = 'aktif' and t.member_user_id is not null
      group by t.member_user_id having count(distinct t.owner_id) > 1
   );

  raise notice 'Dialihkan ke perusahaan: % buku laporan, % catatan pemakaian material, % permintaan material.',
    v_buku, v_pakai, v_minta;
  if v_ragu > 0 then
    raise notice 'DILEWATI: % buku dibuat oleh orang yang menjadi anggota di lebih dari satu perusahaan. Pindahkan manual — menebaknya berarti menaruh laporan di perusahaan yang salah.', v_ragu;
  end if;
end $$;

-- ── Penjagaan untuk baris BARU, di server ──────────────────────────────────
--
-- Aplikasi sudah menyimpan atas nama pemilik workspace, tetapi itu bersandar
-- pada `propfs-workspace-owner` di localStorage — yang hanya terisi bila
-- orangnya masuk lewat halaman login tim atau menukar workspace secara
-- manual. Pengawas yang masuk lewat halaman login biasa tidak punya nilai
-- itu, dan bukunya kembali tersimpan atas namanya sendiri.
--
-- Penjagaan di sini tidak bisa dilewati oleh jalur login mana pun.
create or replace function public.baris_milik_perusahaan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  -- Yang MEMILIKI workspace tidak pernah dialihkan. Seorang pemilik bisa
  -- sekaligus menjadi anggota di perusahaan lain, dan memindahkan datanya
  -- ke sana berarti menyerahkan data perusahaannya sendiri kepada orang lain.
  if exists (select 1 from team_members t where t.owner_id = new.user_id) then
    return new;
  end if;

  -- Hanya keanggotaan TUNGGAL yang bisa disimpulkan. Anggota di dua
  -- perusahaan dibiarkan apa adanya: menebaknya berarti menaruh laporan
  -- lapangan di perusahaan yang salah.
  select (array_agg(distinct t.owner_id))[1] into v_owner
    from team_members t
   where t.member_user_id = new.user_id and t.status = 'aktif'
  having count(distinct t.owner_id) = 1;

  if v_owner is not null then new.user_id := v_owner; end if;
  return new;
end $$;

-- Dipasang hanya bila tabel timnya memang ada. Tanpa penjagaan ini, pemasangan
-- di proyek yang belum menjalankan migration_team.sql akan membuat SETIAP
-- pembuatan buku laporan gagal — fungsi triggernya menunjuk tabel yang tidak
-- ada, dan galatnya muncul jauh dari sini.
do $pasang$
begin
  if to_regclass('public.team_members') is null then
    raise notice 'team_members belum ada — penjagaan baris baru dilewati. Jalankan migration_team.sql lebih dulu.';
    return;
  end if;

  drop trigger if exists trg_field_logs_milik on public.field_logs;
  create trigger trg_field_logs_milik before insert on public.field_logs
    for each row execute function public.baris_milik_perusahaan();

  if to_regclass('public.material_usage') is not null then
    drop trigger if exists trg_material_usage_milik on public.material_usage;
    create trigger trg_material_usage_milik before insert on public.material_usage
      for each row execute function public.baris_milik_perusahaan();
  end if;

  if to_regclass('public.material_requests') is not null then
    drop trigger if exists trg_material_requests_milik on public.material_requests;
    create trigger trg_material_requests_milik before insert on public.material_requests
      for each row execute function public.baris_milik_perusahaan();
  end if;
end $pasang$;
