-- ============================================================
-- PropFS — Serah-terima alat kerja: dipinjam kapan, dibalikin kapan
--
-- `aset_alat` sudah tahu di mana sebuah alat BERADA SEKARANG. Yang tidak
-- diketahuinya adalah bagaimana ia sampai di sana — dan itulah yang hilang
-- justru ketika alatnya tidak ketemu.
--
-- Genset berpindah dari proyek A ke proyek B lewat percakapan WhatsApp yang
-- tidak pernah dicatat. Dua bulan kemudian ia tidak ada di kedua proyek, dan
-- pertanyaan "siapa yang terakhir memegangnya" tidak punya jawaban selain
-- ingatan yang saling bertentangan.
--
-- Tabel ini mencatat PERISTIWA SERAH-TERIMA, bukan lokasi: satu baris per
-- peminjaman, dengan pengembaliannya menyusul di baris yang sama.
--
-- Bentuk itu dipilih dengan sadar. Dua baris terpisah — satu "pinjam", satu
-- "kembali" — tampak lebih rapi, tetapi memungkinkan keadaan yang tidak masuk
-- akal: pengembalian tanpa peminjaman, atau dua pengembalian untuk satu
-- peminjaman. Satu baris membuat keadaan itu MUSTAHIL, bukan sekadar
-- dilarang di lapisan aplikasi.
--
-- Aman dijalankan berulang.
-- Jalankan SETELAH migration_aset_alat.sql.
-- ============================================================

create table if not exists public.aset_pinjam (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Alatnya dihapus, riwayatnya ikut hilang: catatan serah-terima atas alat
  -- yang tidak ada lagi tidak menjawab pertanyaan siapa pun.
  aset_id      uuid not null references public.aset_alat(id) on delete cascade,
  -- Nama alat DISALIN saat dipinjam. Alat yang namanya diperbaiki setahun
  -- kemudian tidak boleh mengubah bunyi tanda terima yang sudah dicetak.
  aset_nama    text not null default '',

  project_id   text,
  project_nama text not null default '',

  -- Orang, bukan jabatan. Inilah yang ditagih kalau alatnya hilang, dan
  -- "Pengawas" tidak bisa ditelepon.
  pemegang     text not null,
  pemegang_hp  text not null default '',

  pinjam_at       timestamptz not null default now(),
  pinjam_oleh     text not null default '',
  pinjam_kondisi  text not null default 'baik',
  -- Foto bercap tanggal & jam, data URL. Wajib diisi aplikasi; tanpa foto
  -- tidak ada cara membuktikan alatnya diserahkan dalam keadaan apa.
  pinjam_foto     text not null default '',
  pinjam_catatan  text not null default '',

  -- Kosong = alatnya MASIH DI LUAR. Ini satu-satunya penentu; sengaja tidak
  -- ada kolom "status" yang bisa berselisih dengannya.
  kembali_at      timestamptz,
  kembali_oleh    text not null default '',
  kembali_kondisi text not null default '',
  kembali_foto    text not null default '',
  kembali_catatan text not null default '',

  janji_kembali   date,

  created_at   timestamptz not null default now()
);

alter table public.aset_pinjam enable row level security;

-- Satu alat tidak boleh dipinjam dua kali sekaligus.
--
-- Dijaga di SINI, bukan hanya di aplikasi: dua orang yang menekan tombol
-- bersamaan di dua HP sama-sama membaca "belum ada yang meminjam", dan
-- keduanya berhasil menyimpan. Yang tersisa dua tanda terima untuk satu
-- genset, dan tidak ada cara mengetahui mana yang benar.
create unique index if not exists aset_pinjam_satu_berjalan
  on public.aset_pinjam (aset_id)
  where kembali_at is null;

create index if not exists aset_pinjam_riwayat_idx
  on public.aset_pinjam (user_id, aset_id, pinjam_at desc);

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'aset_pinjam'
                   and policyname = 'aset_pinjam_all') then
    create policy aset_pinjam_all on public.aset_pinjam
      for all
      using (user_id = auth.uid() or public.is_team_member(user_id))
      with check (user_id = auth.uid() or public.is_team_member(user_id));
  end if;
end $$;

-- ── Lokasi alat ikut berpindah sendiri ─────────────────────────────────────
--
-- Tanpa ini, dua tempat menyimpan jawaban atas pertanyaan yang sama —
-- `aset_alat.lokasi_project_id` dan peminjaman yang sedang berjalan — dan
-- keduanya pasti berselisih suatu hari. Yang berselisih diam-diam lebih buruk
-- daripada yang tidak ada sama sekali.
--
-- Yang menentukan tetap tabel peminjaman; `aset_alat` mengikutinya.
create or replace function public.aset_pinjam_sinkron_lokasi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    -- Peminjaman berjalan yang dihapus: alatnya kembali ke gudang.
    if OLD.kembali_at is null then
      update aset_alat set lokasi_project_id = null, lokasi_nama = '', pemegang = ''
       where id = OLD.aset_id;
    end if;
    return OLD;
  end if;

  if NEW.kembali_at is null then
    update aset_alat set
      lokasi_project_id = nullif(btrim(coalesce(NEW.project_id, '')), ''),
      lokasi_nama = coalesce(NEW.project_nama, ''),
      pemegang = coalesce(NEW.pemegang, '')
     where id = NEW.aset_id;
  else
    -- Sudah kembali. Kondisi terakhir ikut diperbarui: alat yang pulang rusak
    -- tetapi tetap tercatat "baik" akan dipinjamkan lagi kepada orang
    -- berikutnya, yang lalu dituduh merusaknya.
    update aset_alat set
      lokasi_project_id = null, lokasi_nama = '', pemegang = '',
      kondisi = case
        when NEW.kembali_kondisi in ('baik', 'perlu_servis', 'rusak') then NEW.kembali_kondisi
        else kondisi end
     where id = NEW.aset_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_aset_pinjam_sinkron on public.aset_pinjam;
create trigger trg_aset_pinjam_sinkron
  after insert or update or delete on public.aset_pinjam
  for each row execute function public.aset_pinjam_sinkron_lokasi();
