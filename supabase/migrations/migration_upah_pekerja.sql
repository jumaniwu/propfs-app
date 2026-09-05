-- ============================================================
-- PropFS — Upah pekerja yang sudah terdaftar bisa diperbaiki di tempat
--
-- CACAT YANG DIPERBAIKI MIGRASI INI.
--
-- Pekerja didaftarkan lebih dulu — sering oleh mandor, di lapangan, sambil
-- mencatat nama dan nomor HP. Upah hariannya BELUM tentu diketahui saat itu:
-- angkanya disepakati di kantor, kadang beberapa hari kemudian. Jadi orangnya
-- terdaftar dengan upah nol, lalu bekerja, lalu direkap.
--
-- Rekap upah di kantor sudah menunjukkan siapa yang upahnya belum diisi. Yang
-- tidak ada adalah cara memperbaikinya dari sana. Satu-satunya jalan adalah
-- membuka link pekerja di tab lain, mencari orangnya di daftar, lalu
-- mendaftarkannya ULANG dengan angka yang benar.
--
-- Pendaftaran ulang itu bukan sekadar merepotkan, ia berbahaya: kuncinya
-- adalah NAMA. Salah ketik satu huruf akan melahirkan orang KEDUA, dan
-- absensi yang sudah tercatat tetap menempel pada yang lama — satu orang
-- terpecah menjadi dua di rekap upah, persis cacat yang paling mahal di
-- seluruh alur ini.
--
-- Fungsi ini mengubah upah berdasarkan ID, bukan nama. Nama tidak disentuh,
-- jadi tidak ada orang baru yang bisa lahir dari salah ketik.
--
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- Membutuhkan: migration_pekerja_lapangan.sql
-- ============================================================

create or replace function public.field_worker_upah(
  p_token text,
  p_id uuid,
  p_jenis text,
  p_upah numeric
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_log uuid;
  v_jenis text := case when p_jenis = 'borongan' then 'borongan' else 'harian' end;
begin
  -- Token menentukan buku laporannya, dan `log_id = v_log` di bawah mengunci
  -- perubahan hanya pada pekerja buku ITU. Tanpa penguncian itu, siapa pun
  -- yang punya satu token bisa mengubah upah pekerja proyek orang lain
  -- dengan menebak id.
  select id into v_log from field_logs where report_token = p_token;
  if v_log is null then raise exception 'Link tidak berlaku'; end if;

  -- Upah negatif ditolak, bukan disimpan lalu ditampilkan sebagai potongan
  -- yang tidak pernah dimaksudkan siapa pun.
  if coalesce(p_upah, 0) < 0 then raise exception 'Upah tidak boleh minus'; end if;

  update field_workers
     set jenis = v_jenis,
         upah_harian = case when v_jenis = 'borongan' then 0 else coalesce(p_upah, 0) end
   where id = p_id and log_id = v_log;

  -- `found` dikembalikan apa adanya. Nol baris BUKAN galat bagi Postgres,
  -- dan tanpa nilai ini pemanggilnya akan melaporkan "tersimpan" untuk
  -- perubahan yang tidak pernah terjadi — pekerjanya sudah dihapus, atau
  -- id-nya milik buku lain.
  return found;
end;
$$;

revoke all on function public.field_worker_upah(text, uuid, text, numeric) from public;
grant execute on function public.field_worker_upah(text, uuid, text, numeric) to anon, authenticated;
