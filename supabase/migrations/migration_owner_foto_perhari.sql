-- ============================================================
-- PropFS — Halaman owner berhenti mengirim seluruh foto sekaligus
--
-- CACAT YANG DIPERBAIKI MIGRASI INI.
--
-- Pemilik rumah membuka link kalender progres dan mendapat:
--
--   "Data gagal: canceling statement due to statement timeout"
--
-- Selama ini galat itu tertutup di balik "HTTP 500", jadi yang terlihat hanya
-- "link owner tidak bisa dibuka" — dan dugaannya selalu soal hak akses atau
-- migrasi yang belum jalan. Bukan keduanya.
--
-- field_log_by_view_token mengumpulkan SELURUH baris laporan menjadi satu
-- jsonb, termasuk kolom `photos` yang berisi foto dalam bentuk data URL
-- base64. Satu buku dengan 31 laporan dan empat foto per laporan menghasilkan
-- payload 26 MB. Diukur, bukan ditaksir.
--
-- Dua hal buruk terjadi sekaligus:
--   1. Menyusun dan mengirimkannya melewati `statement_timeout` peran `anon`,
--      sehingga halamannya gagal total, bukan lambat.
--   2. Seandainya pun lolos, 26 MB lewat 4G bukan halaman yang bisa dipakai.
--
-- Padahal halaman itu HANYA menampilkan foto untuk satu hari yang diketuk.
-- Kalendernya sendiri cuma butuh tanggal, kegiatan, dan nama pelapor. Seluruh
-- foto bulan itu diangkut untuk menggambar kotak-kotak angka.
--
-- Jadi fotonya dipisahkan: daftarnya ringan, fotonya diambil per hari saat
-- harinya dibuka. Yang dilihat pemilik rumah tidak berkurang sedikit pun.
--
-- Aman dijalankan berulang.
-- Jalankan SETELAH migration_field_reports.sql.
-- ============================================================

-- ── Indeks: laporan sebuah buku, terurut tanggal ───────────────────────────
--
-- Tanpa ini setiap pembukaan halaman memindai seluruh field_reports. Pada
-- tabel yang barisnya besar-besar (foto base64), pemindaian penuh itu sendiri
-- sudah cukup untuk menghabiskan waktu yang tersedia.
create index if not exists idx_field_reports_log_tanggal
  on public.field_reports(log_id, tanggal desc, created_at desc);

-- ── Daftar laporan TANPA foto ──────────────────────────────────────────────
create or replace function public.field_log_by_view_token(p_token text)
returns table (project_name text, reports jsonb)
language sql security definer set search_path = public as $$
  select l.project_name,
         coalesce((
           select jsonb_agg(
                    -- `absensi` dibuang karena RAHASIA: nama tiap tukang dan
                    -- berapa hari ia masuk adalah data internal, bukan milik
                    -- pemilik rumah.
                    --
                    -- `photos` dibuang karena BESAR, bukan karena rahasia —
                    -- ia dikembalikan lewat fungsi di bawah begitu harinya
                    -- diketuk. Yang tersisa di sini hanya jumlahnya, supaya
                    -- layar tetap tahu ada foto yang bisa dibuka.
                    (to_jsonb(r) - 'absensi' - 'photos')
                      || jsonb_build_object(
                           'foto_jumlah',
                           case when jsonb_typeof(r.photos) = 'array'
                                then jsonb_array_length(r.photos) else 0 end)
                    order by r.tanggal desc, r.created_at desc)
           from field_reports r where r.log_id = l.id
         ), '[]'::jsonb)
  from field_logs l where l.view_token = p_token;
$$;

-- ── Foto untuk SATU hari ───────────────────────────────────────────────────
--
-- Dibatasi per tanggal, bukan per laporan, karena itulah yang diketuk di
-- kalender: satu kotak tanggal bisa memuat beberapa laporan.
create or replace function public.field_log_foto_by_view_token(
  p_token text,
  p_tanggal date
)
returns table (id uuid, photos jsonb)
language sql security definer set search_path = public as $$
  select r.id, coalesce(r.photos, '[]'::jsonb)
    from field_reports r
    join field_logs l on l.id = r.log_id
   where l.view_token = p_token
     and r.tanggal = p_tanggal
   order by r.created_at desc;
$$;

revoke all on function public.field_log_by_view_token(text) from public;
revoke all on function public.field_log_foto_by_view_token(text, date) from public;
grant execute on function public.field_log_by_view_token(text) to anon, authenticated;
grant execute on function public.field_log_foto_by_view_token(text, date) to anon, authenticated;
