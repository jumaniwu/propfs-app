-- ============================================================
-- PropFS — Absensi tukang TIDAK ikut ke halaman owner
--
-- Halaman kalender progres dibuka pemilik proyek lewat link bertoken. Sampai
-- sekarang ia menerima seluruh baris laporan apa adanya — termasuk kolom
-- `absensi`, yang berisi nama tiap tukang dan berapa hari ia masuk.
--
-- Itu data internal kita, bukan miliknya. Yang dibayarkan kepada tukang,
-- siapa yang sering tidak masuk, berapa orang yang sebenarnya dikerahkan di
-- proyeknya — semuanya menjadi bahan tawar-menawar begitu terbaca klien.
--
-- Menyembunyikannya di tampilan saja TIDAK CUKUP, dan itulah sebabnya
-- perbaikannya ada di sini. Datanya tetap terkirim dalam JSON; siapa pun yang
-- membuka Network di peramban bisa membacanya utuh. Batas yang sesungguhnya
-- hanya bisa ditarik di tempat datanya diambil.
--
-- Yang dibuang HANYA `absensi`. Kegiatan, catatan, dan fotonya tetap ikut —
-- itu memang yang ingin dilihat pemilik proyek, dan justru alasan link ini
-- dibagikan kepadanya.
--
-- Aman dijalankan berulang.
-- Jalankan SETELAH migration_field_reports.sql.
-- ============================================================

create or replace function public.field_log_by_view_token(p_token text)
returns table (project_name text, reports jsonb)
language sql security definer set search_path = public as $$
  select l.project_name,
         coalesce((
           select jsonb_agg(
                    -- `- 'absensi'` membuang kuncinya dari objek JSON-nya.
                    -- Dipilih daripada menyebutkan satu per satu kolom yang
                    -- BOLEH ikut: kolom baru yang ditambahkan nanti akan ikut
                    -- terkirim dengan sendirinya, dan yang perlu dijaga hanya
                    -- daftar pendek yang memang rahasia.
                    to_jsonb(r) - 'absensi'
                    order by r.tanggal desc, r.created_at desc)
           from field_reports r where r.log_id = l.id
         ), '[]'::jsonb)
  from field_logs l where l.view_token = p_token;
$$;

revoke all on function public.field_log_by_view_token(text) from public;
grant execute on function public.field_log_by_view_token(text) to anon, authenticated;
