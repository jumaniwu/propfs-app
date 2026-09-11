-- ============================================================
-- PropFS — Keanggotaan tim akhirnya menunjuk akun yang sebenarnya
--
-- CACAT YANG DIPERBAIKI MIGRASI INI, dan ukurannya jauh lebih besar daripada
-- satu layar yang kosong.
--
-- `team_members.member_user_id` TIDAK PERNAH DIISI oleh apa pun. Tidak oleh
-- migrasi mana pun, tidak oleh aplikasi. Kolomnya ada, dibaca di banyak
-- tempat, dan selalu NULL.
--
-- Yang membacanya adalah `is_team_member(p_owner)`:
--
--     where t.owner_id = p_owner
--       and t.member_user_id = auth.uid()      -- selalu NULL = auth.uid()
--       and t.status = 'aktif'
--
-- NULL tidak pernah sama dengan apa pun, jadi fungsi itu SELALU mengembalikan
-- false. Dan fungsi itulah yang menjaga puluhan kebijakan RLS di lima belas
-- berkas migrasi — semuanya berbentuk:
--
--     using (auth.uid() = user_id or public.is_team_member(user_id))
--
-- Dengan ruas kanan yang mati, seluruhnya merosot menjadi "hanya baris milik
-- sendiri". Itu sebabnya laporan pengawas tidak pernah terlihat oleh pemilik
-- akun, dan pemilik tidak pernah bisa berbagi apa pun dengan timnya. Bukan
-- karena kebijakannya salah — kebijakannya benar, tetapi separuhnya tidak
-- pernah bisa bernilai benar.
--
-- Selama ini hal itu tertutupi: tiap orang membuat barisnya sendiri, jadi
-- ruas KIRI (`auth.uid() = user_id`) selalu menyelamatkannya. Semua orang
-- melihat pekerjaannya sendiri dan tidak ada yang menyadari ruas kanan tidak
-- bekerja — sampai baris mulai disimpan atas nama perusahaan, dan ruas kiri
-- berhenti berlaku untuk yang membuatnya.
--
-- PENGIKATANNYA LEWAT EMAIL, DAN HANYA EMAIL MILIK SENDIRI.
--
-- Yang diklaim hanya baris yang `member_email`-nya sama dengan email akun yang
-- sedang login — dibaca dari auth.users berdasarkan auth.uid(), bukan dari
-- masukan siapa pun. Tidak ada cara mengklaim keanggotaan orang lain.
--
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.
-- Membutuhkan: migration_team.sql
-- ============================================================

-- ── 1. Perbaikan data: ikat anggota yang sudah terlanjur ada ───────────────
--
-- Tanpa langkah ini, tim yang sudah berjalan harus masuk ulang satu per satu
-- sebelum bisa melihat apa pun lagi.
do $$
declare v_n int := 0;
begin
  update public.team_members t
     set member_user_id = u.id,
         joined_at = coalesce(t.joined_at, now())
    from auth.users u
   where t.member_user_id is null
     and lower(btrim(t.member_email)) = lower(btrim(u.email))
     -- Pemilik tidak pernah menjadi anggota timnya sendiri.
     and t.owner_id <> u.id;
  get diagnostics v_n = row_count;
  raise notice 'Keanggotaan yang diikat ke akun: %', v_n;

  select count(*) into v_n from public.team_members
   where member_user_id is null and status = 'aktif';
  if v_n > 0 then
    raise notice 'BELUM TERIKAT: % anggota aktif yang emailnya belum punya akun PropFS. Mereka akan terikat sendiri begitu mendaftar & masuk dengan email itu.', v_n;
  end if;
end $$;

-- ── 2. Pengikatan untuk yang masuk sesudah ini ─────────────────────────────
--
-- Dipanggil aplikasi setiap kali seseorang masuk. Aman dipanggil berkali-kali:
-- baris yang sudah terikat tidak disentuh.
create or replace function public.team_klaim_keanggotaan()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_n int := 0;
begin
  if auth.uid() is null then return 0; end if;

  -- Email dibaca dari auth.users MILIK PEMANGGIL, bukan dari parameter.
  -- Itu yang membuat fungsi ini tidak bisa dipakai mengklaim keanggotaan
  -- orang lain: tidak ada masukan yang bisa dipalsukan.
  select lower(btrim(email)) into v_email from auth.users where id = auth.uid();
  if v_email is null or v_email = '' then return 0; end if;

  update public.team_members t
     set member_user_id = auth.uid(),
         joined_at = coalesce(t.joined_at, now())
   where t.member_user_id is null
     and lower(btrim(t.member_email)) = v_email
     and t.owner_id <> auth.uid();
  get diagnostics v_n = row_count;

  -- STATUS TIDAK DIUBAH. Anggota yang masih 'diundang' atau sudah
  -- 'nonaktif' tetap begitu — menaikkannya sendiri berarti memberi akses
  -- kepada orang yang belum atau sudah tidak disetujui pemiliknya.
  return v_n;
end $$;

revoke all on function public.team_klaim_keanggotaan() from public;
grant execute on function public.team_klaim_keanggotaan() to authenticated;
