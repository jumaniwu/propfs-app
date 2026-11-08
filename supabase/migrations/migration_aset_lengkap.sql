-- ============================================================
-- PropFS — Nomor aset, foto alat, dan kelengkapan yang diperiksa saat kembali
--
-- Lima gerinda bermerek sama tidak bisa dibedakan dari nama, merek, atau
-- fotonya. Yang membedakannya hanya nomor yang ditulis di badannya —
-- 008/NBI/XI/26 — dan nomor itulah yang harus tercatat, supaya "gerinda yang
-- dipinjam Budi" menunjuk SATU alat, bukan lima.
--
-- Yang ditambahkan:
--
--   aset_alat.foto           foto alatnya (data URL, cap tanggal tercetak)
--   aset_alat.kelengkapan    yang seharusnya ikut: cover, kunci, kabel, ...
--   aset_pinjam.aset_kode    nomor aset, disalin saat dipinjam
--   aset_pinjam.pinjam_kelengkapan   yang ikut diserahkan
--   aset_pinjam.kembali_kelengkapan  yang ikut kembali
--
-- Yang diserahkan tetapi tidak kembali = KURANG. Itu dihitung aplikasi dari
-- dua kolom terakhir; sengaja tidak disimpan sebagai kolom ketiga yang bisa
-- berselisih dengan keduanya.
--
-- Kolom aset_alat.kode SUDAH ADA sejak migration_aset_alat.sql; di aplikasi
-- ia kini tampil sebagai "Nomor aset" dan wajib diisi untuk alat baru.
--
-- Tidak ada data yang dihapus atau diubah. Aman dijalankan berulang.
-- Jalankan SETELAH migration_aset_pinjam.sql.
-- ============================================================

alter table public.aset_alat
  add column if not exists foto text not null default '';
alter table public.aset_alat
  add column if not exists kelengkapan jsonb not null default '[]'::jsonb;

alter table public.aset_pinjam
  add column if not exists aset_kode text not null default '';
alter table public.aset_pinjam
  add column if not exists pinjam_kelengkapan jsonb not null default '[]'::jsonb;
alter table public.aset_pinjam
  add column if not exists kembali_kelengkapan jsonb not null default '[]'::jsonb;

-- ── Satu nomor aset untuk satu alat ────────────────────────────────────────
--
-- Dijaga di sini juga, bukan hanya di aplikasi: dua orang yang mencatat alat
-- bersamaan di dua HP sama-sama melihat nomornya belum dipakai.
--
-- Indeksnya hanya dibuat bila data yang ADA belum punya nomor kembar. Bila
-- sudah ada, migrasi ini tidak gagal dan tidak mengubah apa pun — ia memberi
-- tahu nomor mana yang kembar supaya dirapikan dulu, lalu dijalankan lagi.
do $$
declare
  kembar text;
begin
  if exists (select 1 from pg_indexes
              where schemaname = 'public' and indexname = 'aset_alat_nomor_unik') then
    return;
  end if;

  select string_agg(distinct upper(btrim(kode)), ', ') into kembar
    from (
      select user_id, kode
        from public.aset_alat
       where btrim(kode) <> ''
         and (user_id, upper(btrim(kode))) in (
               select user_id, upper(btrim(kode)) from public.aset_alat
                where btrim(kode) <> ''
                group by 1, 2 having count(*) > 1)
    ) k;

  if kembar is not null then
    raise notice 'Nomor aset kembar, indeks unik belum dibuat: %. Ganti salah satunya lalu jalankan berkas ini lagi.', kembar;
  else
    create unique index aset_alat_nomor_unik
      on public.aset_alat (user_id, upper(btrim(kode)))
      where btrim(kode) <> '';
  end if;
end $$;

comment on column public.aset_alat.kode is
  'Nomor aset — sama dengan yang tertulis di badan alatnya, mis. 008/NBI/XI/26.';
comment on column public.aset_alat.kelengkapan is
  'Kelengkapan yang seharusnya ikut bersama alat ini (larik teks).';
comment on column public.aset_pinjam.kembali_kelengkapan is
  'Kelengkapan yang ikut kembali. Yang ada di pinjam_kelengkapan tetapi tidak di sini = kurang.';
