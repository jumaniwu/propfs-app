-- ============================================================
-- PropFS — Absensi pekerja, menyatu dengan laporan harian lapangan
--
-- Absensi TIDAK dibuatkan tabel sendiri. Mandor sudah mengisi laporan harian
-- tiap sore; kalau absensi jadi kiriman kedua dengan tanggal dan nama pelapor
-- yang harus diketik ulang, ia akan diisi seminggu sekali dari ingatan.
-- Jadi absensi adalah satu kolom di baris laporan yang sama: satu tanggal,
-- satu pengiriman, satu ketukan kirim.
--
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- ============================================================

-- ── 1. Kolom absensi ────────────────────────────────────────────────────────
-- Bentuk tiap elemen:
--   { "nama": "Pak Yono", "peran": "Mandor", "status": "hadir", "lembur": 2 }
-- status ∈ hadir | setengah | izin | alpa. Baris laporan lama tetap sah:
-- default '[]' membuatnya terbaca sebagai "tidak ada absensi", bukan galat.
alter table public.field_reports
  add column if not exists absensi jsonb not null default '[]'::jsonb;

-- ── 2. Pekerja mengirim laporan harian, kini beserta absensinya ─────────────
--
-- DROP dulu, bukan CREATE OR REPLACE: menambah parameter tidak mengganti
-- fungsinya melainkan membuat kelebihan-beban kedua, dan PostgREST lalu
-- menolak memilih di antara keduanya ("could not choose the best candidate
-- function"). Satu fungsi, satu tanda tangan.
drop function if exists public.field_report_submit(text, date, text, jsonb, text, jsonb);

create or replace function public.field_report_submit(
  p_token text, p_tanggal date, p_pelapor text,
  p_kegiatan jsonb, p_catatan text, p_photos jsonb,
  p_absensi jsonb default '[]'::jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_log uuid;
  v_absensi jsonb;
begin
  select id into v_log from field_logs where report_token = p_token;
  if v_log is null then return false; end if;
  if length(coalesce(p_pelapor, '')) < 2 then return false; end if;
  if jsonb_typeof(p_kegiatan) <> 'array' or jsonb_typeof(p_photos) <> 'array' then return false; end if;

  -- Absensi yang tidak berbentuk larik dicatat sebagai kosong, TIDAK menolak
  -- laporannya. Kegiatan dan foto hari itu jauh lebih mahal untuk hilang
  -- daripada absensi yang bisa diisi ulang.
  v_absensi := case when jsonb_typeof(p_absensi) = 'array' then p_absensi else '[]'::jsonb end;

  insert into field_reports (log_id, tanggal, pelapor, kegiatan, catatan, photos, absensi)
  values (v_log, coalesce(p_tanggal, current_date), p_pelapor,
          p_kegiatan, coalesce(p_catatan, ''), p_photos, v_absensi);
  return true;
end;
$$;

-- ── 3. Header halaman pekerja + daftar pekerja yang pernah tercatat ─────────
--
-- Daftar nama inilah yang membuat absensi harian menjadi pekerjaan MENGETUK,
-- bukan mengetik — dan sekaligus yang menjaga nama ditulis sama tiap hari.
-- Tanpanya, "Pak Yono" dan "Yono" menjadi dua orang di rekap upah.
--
-- Bentuk kembaliannya berubah (satu kolom bertambah), jadi harus di-DROP.
drop function if exists public.field_log_by_report_token(text);

create or replace function public.field_log_by_report_token(p_token text)
returns table (project_name text, drive_webhook text, pekerja jsonb)
language sql security definer set search_path = public as $$
  select l.project_name, l.drive_webhook,
         coalesce((
           select jsonb_agg(jsonb_build_object('nama', q.nm, 'peran', q.pr) order by q.nm)
           from (
             -- distinct on: satu baris per nama, dengan peran dari catatan
             -- TERBARU — tukang yang naik jadi mandor tidak perlu dikoreksi
             -- ke belakang.
             select distinct on (lower(btrim(a->>'nama')))
                    btrim(a->>'nama')             as nm,
                    coalesce(btrim(a->>'peran'), '') as pr
             from field_reports r,
                  lateral jsonb_array_elements(r.absensi) a
             where r.log_id = l.id
               and jsonb_typeof(r.absensi) = 'array'
               -- 90 hari: cukup panjang untuk menampung pekerja musiman,
               -- cukup pendek supaya daftarnya tidak menjadi arsip.
               and r.tanggal >= current_date - interval '90 days'
               and length(btrim(coalesce(a->>'nama', ''))) >= 2
             order by lower(btrim(a->>'nama')), r.tanggal desc, r.created_at desc
           ) q
         ), '[]'::jsonb)
  from field_logs l
  where l.report_token = p_token;
$$;

-- ── 4. Hak akses ───────────────────────────────────────────────────────────
revoke all on function public.field_report_submit(text, date, text, jsonb, text, jsonb, jsonb) from public;
revoke all on function public.field_log_by_report_token(text) from public;
grant execute on function public.field_report_submit(text, date, text, jsonb, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.field_log_by_report_token(text) to anon, authenticated;

-- field_log_by_view_token TIDAK perlu diubah: ia mengembalikan to_jsonb(r)
-- atas seluruh baris, jadi kolom absensi ikut terbawa dengan sendirinya ke
-- halaman kalender owner.
