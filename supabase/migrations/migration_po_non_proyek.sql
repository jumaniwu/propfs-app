-- ============================================================
-- PropFS — Purchase Order yang bukan milik proyek
--
-- Sampai sekarang setiap PO harus punya proyek, dan barangnya hanya boleh
-- datang dari Material Request yang sudah disetujui. Jadi pembelian yang
-- memang tidak menempel pada proyek mana pun — genset, scaffolding, mesin
-- las, ATK kantor — tidak punya jalan masuk sama sekali.
--
-- Penandanya kolom `jenis`, BUKAN `project_name` yang dikosongkan.
--
-- Sebabnya penting: `project_name` kosong hari ini berarti CACAT DATA, bukan
-- "non-proyek". migration_do_proyek.sql menyebut PO seperti itu "yatim" dan
-- mengisi ulang nama proyeknya sendiri dari Material Request asal barangnya,
-- dan antarmukanya pun memperingatkan. Kalau PO alat ditandai dengan
-- mengosongkan `project_name`, ia akan diperlakukan sebagai kerusakan yang
-- perlu diperbaiki — oleh kode yang memang sudah bekerja dengan benar.
--
-- PO lama otomatis bernilai 'proyek', jadi tidak ada satu pun perilaku lama
-- yang berubah.
--
-- Aman dijalankan berulang kali.
-- Jalankan SETELAH migration_procurement.sql.
-- ============================================================

alter table public.purchase_orders
  add column if not exists jenis text not null default 'proyek';

-- Check dipasang terpisah supaya migrasi ini tetap aman diulang: menambahkan
-- constraint bernama yang sudah ada akan melempar error, sedangkan
-- `add column if not exists` tidak.
do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_orders_jenis_check'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_jenis_check
      check (jenis in ('proyek', 'alat', 'kantor'));
  end if;
end $do$;

comment on column public.purchase_orders.jenis is
  'proyek = pembelian untuk sebuah proyek (bawaan). '
  'alat = barang modal yang dipakai berulang, dicatat sebagai aset perusahaan. '
  'kantor = biaya operasional kantor, langsung jadi beban non-proyek.';

-- Baris yang terlanjur ada sebelum kolom ini lahir sudah mendapat 'proyek'
-- lewat DEFAULT. Pernyataan di bawah hanya untuk basis data yang kolomnya
-- sempat ditambahkan tanpa default.
update public.purchase_orders
   set jenis = 'proyek'
 where jenis is null or trim(jenis) = '';
