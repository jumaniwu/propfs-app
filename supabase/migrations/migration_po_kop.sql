-- ============================================================
-- PropFS — Kop perusahaan ikut terbawa pada PO yang dibuka vendor
--
-- Halaman /po/:token dibuka vendor TANPA login, jadi identitas perusahaan
-- pembeli tidak bisa diambil dari cache lokal maupun dari sesi — keduanya
-- milik perangkat pemakai aplikasi, bukan perangkat vendor. Akibatnya PDF
-- yang diunduh vendor selalu memakai kop bawaan "PropFS", bukan kop
-- perusahaan yang benar-benar memesan.
--
-- Maka nama, logo, dan kontak perusahaan ikut dikembalikan bersama PO-nya.
-- Yang dibuka hanya identitas yang memang tercetak pada surat resmi ke
-- vendor — setara dengan branding_by_token yang sudah ada, dan hanya untuk
-- PO yang benar-benar sudah dikirim ke vendor tersebut.
--
-- Jalankan di Supabase SQL Editor SETELAH migration_procurement.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

-- Bentuk hasilnya bertambah kolom, dan Postgres menolak `create or replace`
-- yang mengubah daftar kolom (ERROR 42P13). Fungsi lama dibuang dulu.
drop function if exists public.po_get_by_token(text);

create or replace function public.po_get_by_token(p_token text)
returns table (
  nomor text, vendor_nama text, project_name text, tanggal date,
  butuh_tanggal date, term text, term_hari int, items jsonb,
  subtotal numeric, ppn_pct numeric, ppn numeric, total numeric,
  catatan text, status text,
  pembuat_nama text, pembuat_jabatan text, pembuat_signature text, pembuat_signed_at timestamptz,
  approver_nama text, approver_jabatan text, approver_signature text, approver_signed_at timestamptz,
  -- Kop perusahaan pembeli, untuk dicetak di PDF yang diunduh vendor.
  kop_nama text, kop_logo text, kop_kontak text
)
language sql security definer stable set search_path = public as $$
  select p.nomor, p.vendor_nama, p.project_name, p.tanggal,
         p.butuh_tanggal, p.term, p.term_hari, p.items,
         p.subtotal, p.ppn_pct, p.ppn, p.total,
         p.catatan, p.status,
         p.pembuat_nama, p.pembuat_jabatan, p.pembuat_signature, p.pembuat_signed_at,
         p.approver_nama, p.approver_jabatan, p.approver_signature, p.approver_signed_at,
         coalesce(c.nama_perusahaan, ''),
         coalesce(c.logo_url, ''),
         -- Baris kontak disusun di server supaya bagian yang kosong tidak
         -- meninggalkan pemisah "·" menggantung di kop.
         array_to_string(
           array_remove(array[
             nullif(trim(coalesce(c.alamat, '')), ''),
             nullif(trim(coalesce(c.telepon, '')), ''),
             nullif(trim(coalesce(c.email, '')), ''),
             nullif(trim(coalesce(c.website, '')), '')
           ], null), ' · ')
  from purchase_orders p
  left join company_profiles c on c.user_id = p.user_id
  where p.view_token = p_token
    and p.status in ('terkirim', 'selesai')
  limit 1;
$$;

revoke all on function public.po_get_by_token(text) from public;
grant execute on function public.po_get_by_token(text) to anon, authenticated;
