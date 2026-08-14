-- ============================================================
-- PropFS — Menyimpan kwitansi yang SUDAH dibubuhi e-Meterai
--
-- Pembubuhannya dikerjakan sendiri di situs e-Meterai, di luar aplikasi ini.
-- Hasilnya diunggah kembali, dan ITULAH yang dikirim ke konsumen — mengirim
-- PDF bersih padahal versi bermeterainya ada berarti konsumen memegang dokumen
-- yang lebih lemah daripada yang sudah dibayar meterainya.
--
-- Aman dijalankan berulang kali.
-- Jalankan SETELAH migration_kwitansi_materai.sql.
-- ============================================================
alter table public.kwitansi
  add column if not exists materai_pdf text;
