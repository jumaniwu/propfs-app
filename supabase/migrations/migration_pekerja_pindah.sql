-- ============================================================
-- PropFS — Upah yang tersimpan tapi tidak pernah terlihat, dan pekerja yang
--          pindah proyek tanpa kehilangan gaji proyek sebelumnya
--
-- ── CACAT 1: upah tersimpan, rekapnya tetap nol ───────────────────────────
--
-- Upah Mario diisi lewat rekap, server menjawab berhasil ("Upah diperbarui:
-- Rp 130.000/hari"), dan baris Mario TETAP berbunyi "upah belum diisi" dengan
-- upah Rp 0.
--
-- Sebabnya: rekap upah membaca daftar pekerja lewat field_workers_by_token,
-- yang menyaring `where w.aktif`. Pekerja yang sudah dinonaktifkan tidak ikut
-- terbaca — jadi tarifnya tidak ditemukan, dan angkanya jatuh ke nol berapa
-- kali pun diperbarui.
--
-- Itu bertentangan dengan alasan kolom `aktif` dibuat, yang tertulis di
-- migrasinya sendiri: "Pekerja yang sudah tidak bekerja di sini TIDAK
-- dihapus: absensinya yang sudah lewat masih harus bisa dibaca DAN DIBAYAR."
-- Daftar absen hari ini memang hanya boleh menawarkan yang aktif. Rekap upah
-- bulan lalu tidak — ia menghitung uang untuk hari-hari yang sudah lewat.
--
-- Jadi dibuat fungsi kedua: daftar LENGKAP untuk kantor, dan
-- field_workers_by_token yang lama tidak disentuh sama sekali supaya halaman
-- absensi mandor tetap menawarkan yang aktif saja.
--
-- ── CACAT 2: pekerja terkunci di satu proyek ──────────────────────────────
--
-- Tukang berpindah proyek di tengah bulan — itu kejadian biasa. Tetapi
-- field_workers menempel pada SATU buku laporan, jadi ia harus didaftarkan
-- ulang di proyek baru, dengan id baru.
--
-- Memindahkannya dengan mengubah log_id akan MENGHANGUSKAN gaji proyek lama:
-- absensi lama menunjuk id itu, dan begitu barisnya pindah buku, rekap proyek
-- lama tidak menemukannya lagi — persis cacat 1 di atas, tetapi permanen.
--
-- Karena itu pemindahan di sini MENYALIN, bukan memindahkan. Baris lama
-- tinggal di proyek lama dan hanya dinonaktifkan: ia berhenti ditawarkan di
-- absen harian proyek itu, tetapi tarifnya tetap terbaca oleh rekap upah —
-- sekarang bisa, berkat fungsi lengkap di atas.
--
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- Membutuhkan: migration_pekerja_lapangan.sql
-- ============================================================

-- ── Daftar pekerja LENGKAP, termasuk yang sudah nonaktif ───────────────────
--
-- Dipakai rekap upah di kantor. `aktif` ikut dikembalikan supaya layar bisa
-- membedakan "masih bekerja di sini" dari "tinggal riwayatnya".
create or replace function public.field_workers_semua_by_token(p_token text)
returns table (
  id uuid, nama text, peran text, no_hp text,
  jenis text, upah_harian numeric, foto text, aktif boolean
)
language sql security definer set search_path = public as $$
  select w.id, w.nama, w.peran, w.no_hp, w.jenis, w.upah_harian, w.foto, w.aktif
  from field_workers w
  join field_logs l on l.id = w.log_id
  where l.report_token = p_token
  order by w.aktif desc, lower(w.nama);
$$;

-- ── Pindahkan pekerja ke proyek lain ───────────────────────────────────────
--
-- MENYALIN, bukan memindahkan. Lihat penjelasan di kepala berkas: memindahkan
-- log_id akan menghanguskan gaji proyek sebelumnya.
create or replace function public.field_worker_pindah(
  p_token_asal text,
  p_id uuid,
  p_token_tujuan text,
  p_nonaktifkan_asal boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_asal uuid;
  v_tujuan uuid;
  v_pemilik_asal uuid;
  v_pemilik_tujuan uuid;
  v_baru uuid;
  w record;
begin
  select id, user_id into v_asal, v_pemilik_asal
    from field_logs where report_token = p_token_asal;
  if v_asal is null then raise exception 'Link proyek asal tidak berlaku'; end if;

  select id, user_id into v_tujuan, v_pemilik_tujuan
    from field_logs where report_token = p_token_tujuan;
  if v_tujuan is null then raise exception 'Link proyek tujuan tidak berlaku'; end if;

  if v_asal = v_tujuan then
    raise exception 'Proyek asal dan tujuan sama.';
  end if;

  -- Lintas PERUSAHAAN ditolak. Dua token yang sah tidak berarti keduanya
  -- milik orang yang sama, dan memindahkan pekerja antar perusahaan
  -- membocorkan nama, nomor HP, dan TARIF UPAH-nya ke perusahaan lain.
  if v_pemilik_asal is distinct from v_pemilik_tujuan then
    raise exception 'Proyek tujuan milik perusahaan lain.';
  end if;

  select * into w from field_workers where id = p_id and log_id = v_asal;
  if not found then raise exception 'Pekerja tidak ditemukan di proyek asal.'; end if;

  -- Sudah pernah dipindahkan? Kembalikan yang sudah ada, jangan buat kedua.
  -- Dipanggil dua kali karena sinyal lambat adalah kejadian biasa di lapangan.
  select id into v_baru from field_workers
   where log_id = v_tujuan and lower(btrim(nama)) = lower(btrim(w.nama));

  if v_baru is null then
    insert into field_workers (log_id, nama, peran, no_hp, jenis, upah_harian, foto, catatan)
    values (v_tujuan, w.nama, w.peran, w.no_hp, w.jenis, w.upah_harian, w.foto, w.catatan)
    returning id into v_baru;
  else
    -- Sudah ada di sana: tarif & datanya disegarkan, tetapi TIDAK dikosongkan
    -- oleh nilai yang kebetulan kosong di proyek asal.
    update field_workers t set
      peran = case when btrim(w.peran) <> '' then w.peran else t.peran end,
      no_hp = case when btrim(w.no_hp) <> '' then w.no_hp else t.no_hp end,
      jenis = w.jenis,
      upah_harian = w.upah_harian,
      foto = case when btrim(w.foto) <> '' then w.foto else t.foto end,
      aktif = true
     where t.id = v_baru;
  end if;

  -- Baris ASAL tidak dihapus dan tidak diubah log_id-nya — hanya berhenti
  -- ditawarkan di absen harian proyek lama. Absensi yang sudah tercatat di
  -- sana tetap menunjuk id ini, dan tarifnya tetap terbaca oleh rekap upah.
  if coalesce(p_nonaktifkan_asal, true) then
    update field_workers set aktif = false where id = p_id and log_id = v_asal;
  end if;

  return v_baru;
end $$;

revoke all on function public.field_workers_semua_by_token(text) from public;
revoke all on function public.field_worker_pindah(text, uuid, text, boolean) from public;
grant execute on function public.field_workers_semua_by_token(text) to anon, authenticated;
grant execute on function public.field_worker_pindah(text, uuid, text, boolean) to authenticated;
