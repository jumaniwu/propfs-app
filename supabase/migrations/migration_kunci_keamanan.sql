-- ============================================================
-- PropFS — Menutup celah kebocoran data
--
-- YANG DIPASANG DI SINI.
--
-- 1. Kolom profil yang menentukan hak akses dan paket — role,
--    custom_features, masa coba, is_active, slot add-on, kode referral —
--    hanya bisa diubah superadmin. Kolom-kolom ini menentukan siapa melihat
--    apa dan siapa membayar apa, jadi tidak boleh bisa diubah pemiliknya
--    sendiri. Pemicu kuota yang sudah ada hanya menjaga dua kolom kuota.
--
-- 2. email_logs dan budget_configs mendapat RLS. Keduanya hanya dipakai
--    kode server dengan kunci servis, jadi tidak boleh terbuka untuk
--    permintaan dari luar.
--
-- YANG TIDAK BERUBAH.
--
--    Tidak ada satu baris data pun yang dihapus atau diubah oleh berkas ini.
--    Pengguna tetap bisa memperbarui nama, perusahaan, dan nomor teleponnya,
--    dan aplikasi tetap bisa menandai masa cobanya habis. Superadmin tetap
--    bisa mengubah apa saja. Fungsi server (webhook pembayaran, cron) tetap
--    berjalan seperti biasa — mereka tidak membawa identitas pengguna.
--
-- Aman dijalankan berulang. Jalankan di Supabase SQL Editor.
-- ============================================================


-- ── 1. Kolom profil yang hanya boleh diubah superadmin ──────────────────────
--
-- Kolomnya dibandingkan lewat to_jsonb, BUKAN lewat NEW.nama_kolom.
--
-- Sebagian kolom ini lahir dari migrasi yang belum tentu pernah dijalankan
-- di database ini (addon_user_slots, kuota_*, custom_features, masa coba).
-- Menyebut kolom yang tidak ada lewat NEW.x membuat pemicu gagal di SETIAP
-- pembaruan profil — termasuk mengganti nama — dan seluruh aplikasi berhenti
-- menyimpan profil. Lewat to_jsonb, kolom yang tidak ada bernilai NULL di
-- kedua sisi, sehingga dianggap tidak berubah.
create or replace function public.lindungi_kolom_profil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  baru jsonb := to_jsonb(new);
  lama jsonb;
  kolom text;
  terjaga constant text[] := array[
    'role', 'custom_features', 'is_active',
    'trial_started_at', 'trial_expires_at', 'is_trial_extended',
    'addon_fs_slots', 'addon_cost_slots', 'addon_user_slots',
    'kuota_fs', 'kuota_kontraktor', 'referral_code'
  ];
begin
  -- Tanpa identitas pengguna: service_role (webhook, cron), SQL Editor, dan
  -- pemicu internal. Pengunjung tanpa login juga tidak punya identitas,
  -- tetapi RLS profiles sudah menolak mereka sebelum sampai ke sini.
  if auth.uid() is null then
    return new;
  end if;

  -- Status superadmin dibaca dari baris yang TERSIMPAN, bukan dari NEW.
  -- Membacanya dari NEW berarti percobaan menaikkan diri sendiri justru
  -- meluluskan dirinya sendiri.
  if exists (select 1 from profiles where id = auth.uid() and role = 'superadmin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Profil yang dibuat sendiri (jalur pemulihan bila pemicu pendaftaran
    -- gagal) selalu dimulai sebagai pengguna biasa, apa pun yang dikirim.
    new.role := 'user';
    return new;
  end if;

  lama := to_jsonb(old);
  foreach kolom in array terjaga loop
    if (baru -> kolom) is distinct from (lama -> kolom) then
      raise exception 'Kolom % hanya bisa diubah superadmin.', kolom
        using errcode = '42501';
    end if;
  end loop;

  -- Masa coba boleh DIAKHIRI oleh aplikasinya sendiri, tidak boleh
  -- dihidupkan kembali.
  if (baru -> 'trial_status') is distinct from (lama -> 'trial_status')
     and coalesce(baru ->> 'trial_status', '') <> 'trial_expired' then
    raise exception 'Status masa coba hanya bisa diakhiri, tidak bisa dihidupkan kembali.'
      using errcode = '42501';
  end if;

  -- Perujuk diisi SEKALI saat mendaftar. Menggantinya sesudah itu berarti
  -- memindahkan komisi orang lain ke diri sendiri.
  if (baru -> 'referred_by') is distinct from (lama -> 'referred_by')
     and (lama ->> 'referred_by') is not null then
    raise exception 'Perujuk tidak bisa diganti setelah terisi.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists trg_lindungi_kolom_profil on public.profiles;
create trigger trg_lindungi_kolom_profil
  before insert or update on public.profiles
  for each row execute function public.lindungi_kolom_profil();


-- ── 2. email_logs & budget_configs: RLS dinyalakan ──────────────────────────
--
-- Yang menulis dan membaca kedua tabel ini hanya kode server
-- (api/cron-reminders.ts, supabase/functions/send-email) yang memakai
-- SERVICE_ROLE_KEY — dan kunci itu memang melewati RLS. Browser tidak pernah
-- menyentuhnya. Jadi menyalakan RLS tidak mematikan fitur apa pun; yang
-- tertutup hanya pintu yang memang tidak boleh terbuka.
--
-- Superadmin tetap bisa membacanya dari dasbor admin.
do $$
begin
  if to_regclass('public.email_logs') is not null then
    execute 'alter table public.email_logs enable row level security';
    if not exists (select 1 from pg_policies
                    where tablename = 'email_logs' and policyname = 'email_logs_superadmin_baca') then
      execute 'create policy email_logs_superadmin_baca on public.email_logs
                 for select using (public.is_superadmin())';
    end if;
  end if;

  if to_regclass('public.budget_configs') is not null then
    execute 'alter table public.budget_configs enable row level security';
    if not exists (select 1 from pg_policies
                    where tablename = 'budget_configs' and policyname = 'budget_configs_superadmin') then
      execute 'create policy budget_configs_superadmin on public.budget_configs
                 for all using (public.is_superadmin()) with check (public.is_superadmin())';
    end if;
  end if;
end $$;
