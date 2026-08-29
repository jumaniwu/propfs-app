-- ============================================================
-- PropFS — Alamat pengiriman ikut ke halaman & PDF vendor
--
-- Alamat kirim, nama penerima, nomornya, dan catatan arahan lokasi sudah
-- tersimpan di `purchase_orders` sejak migration_po_revisi_pengiriman.sql.
-- Tetapi `po_get_by_token` — satu-satunya jalan data sampai ke halaman yang
-- dibuka vendor — menyebutkan kolomnya SATU PER SATU, dan keempat kolom itu
-- tidak ada di daftarnya.
--
-- Akibatnya tidak terlihat dari mana pun. Di aplikasi alamatnya tampak
-- tersimpan dengan benar; di halaman vendor ia tidak pernah ada, dan PDF yang
-- diunduh vendor dari halaman itu ikut kosong. Sopir tetap menelepon
-- menanyakan alamat, persis seperti sebelum kolomnya dibuat — dan yang
-- mengisinya menyangka sudah beres.
--
-- Tidak ada galat yang muncul karena tipe di sisi TypeScript menyatakan
-- kolomnya ada. Yang berbohong justru bagian yang seharusnya menjaga.
--
-- SEKALIGUS: `project_name` DIBUANG dari yang dikirim ke vendor. Ia catatan
-- internal — yang membedakan pembelian Noble Cove dari pembelian proyek lain
-- di buku kita sendiri. Nama proyek sering nama pemiliknya, dan setiap vendor
-- yang menerima PO jadi tahu siapa saja klien kita. Yang vendor perlukan
-- alamat antar dan nama penerima, dan keduanya sekarang benar-benar terkirim.
--
-- Aman dijalankan berulang.
-- Jalankan SETELAH migration_po_kop.sql dan migration_po_revisi_pengiriman.sql.
-- ============================================================

-- Tipe kembaliannya berubah, jadi fungsinya harus dibuang dulu.
drop function if exists public.po_get_by_token(text);

create or replace function public.po_get_by_token(p_token text)
returns table (
  nomor text, vendor_nama text, tanggal date,
  butuh_tanggal date, term text, term_hari int, items jsonb,
  subtotal numeric, ppn_pct numeric, ppn numeric, total numeric,
  catatan text, status text,
  pembuat_nama text, pembuat_jabatan text, pembuat_signature text, pembuat_signed_at timestamptz,
  approver_nama text, approver_jabatan text, approver_signature text, approver_signed_at timestamptz,
  -- Ke mana barangnya diantar, dan siapa yang menerimanya.
  kirim_alamat text, kirim_nama text, kirim_wa text, kirim_catatan text,
  kop_nama text, kop_logo text, kop_kontak text
)
language sql security definer stable set search_path = public as $$
  select p.nomor, p.vendor_nama, p.tanggal,
         p.butuh_tanggal, p.term, p.term_hari, p.items,
         p.subtotal, p.ppn_pct, p.ppn, p.total,
         p.catatan, p.status,
         p.pembuat_nama, p.pembuat_jabatan, p.pembuat_signature, p.pembuat_signed_at,
         p.approver_nama, p.approver_jabatan, p.approver_signature, p.approver_signed_at,
         -- `coalesce` supaya PO lama yang kolomnya masih NULL mengirim string
         -- kosong, bukan null: sisi aplikasi hanya perlu memeriksa "kosong
         -- atau tidak", satu keadaan, bukan dua.
         coalesce(p.kirim_alamat, ''), coalesce(p.kirim_nama, ''),
         coalesce(p.kirim_wa, ''), coalesce(p.kirim_catatan, ''),
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
