-- ============================================================
-- PropFS — Halaman konsumen harus bisa mengunduh versi BERMETERAI
--
-- Kolom `materai_pdf` sudah ada (migration_kwitansi_materai_pdf.sql), tetapi
-- RPC `kwitansi_by_token` tidak pernah mengembalikannya. Akibatnya halaman
-- kwitansi publik tidak punya cara mengetahui bahwa versi bermeterainya ada,
-- lalu MENGGAMBAR ULANG PDF bersih dari data barisnya.
--
-- Jadi konsumen membaca "Sudah dibubuhi e-Meterai resmi" di layar, menekan
-- Unduh PDF, dan menerima berkas tanpa meterai. Meterai yang sudah dibayar
-- tidak pernah sampai ke tangan yang memerlukannya — dan itu baru ketahuan
-- kalau kwitansinya dipersoalkan, yaitu saat satu-satunya waktu ia penting.
--
-- Aman dijalankan berulang kali.
-- Jalankan SETELAH migration_kwitansi_materai_pdf.sql.
-- ============================================================

-- Jenis kembaliannya bertambah satu kolom, dan Postgres tidak mengizinkan
-- `create or replace` mengubah bentuk kembalian sebuah fungsi. Jadi dijatuhkan
-- lebih dulu; hak aksesnya diberikan lagi di bawah.
drop function if exists public.kwitansi_by_token(text);

create function public.kwitansi_by_token(p_token text)
returns table (
  nomor text, tanggal date, penerima_dari text, untuk_pembayaran text,
  jumlah numeric, metode text, project_name text, catatan text,
  penanda_nama text, penanda_jabatan text, penanda_signature text,
  materai_status text, materai_sn text, materai_pdf text,
  kop_nama text, kop_logo text, kop_kontak text
)
language sql security definer stable set search_path = public as $$
  select k.nomor, k.tanggal, k.penerima_dari, k.untuk_pembayaran,
         k.jumlah, k.metode, k.project_name, k.catatan,
         k.penanda_nama, k.penanda_jabatan, k.penanda_signature,
         k.materai_status, k.materai_sn,
         -- Hanya dikirim bila meterainya MEMANG sudah terbubuh. Baris yang
         -- statusnya belum 'terbubuh' tidak punya alasan menyerahkan berkas
         -- sebesar itu kepada siapa pun yang memegang tautannya.
         case when k.materai_status = 'terbubuh' then k.materai_pdf else null end,
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
grant execute on function public.kwitansi_by_token(text) to anon, authenticated;
