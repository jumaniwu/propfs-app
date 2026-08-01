-- ============================================================
-- PropFS — Kontraktor AI: Chat Tim per workspace
--
-- Sampai sekarang koordinasi tim terjadi di WhatsApp, di luar sistem. Akibatnya
-- dua hal yang sama-sama merugikan: keputusan lapangan tidak punya jejak yang
-- bisa dirujuk, dan tidak ada dasar apa pun untuk menilai siapa mengerjakan apa.
--
-- Tabel ini menyimpan PESAN ORANG saja. Kabar sistem — laporan harian masuk,
-- material diminta, PO disetujui, SPK ditandatangani — TIDAK ditulis ke sini.
-- Kabar itu sudah tercatat di tabelnya masing-masing, dan disisipkan ke aliran
-- chat saat dibaca (lihat src/lib/chatTim.ts). Tiga alasannya:
--
--   1. Tidak ada trigger yang bisa gagal terpasang atau ketinggalan zaman.
--   2. Berlaku surut — kejadian sebelum fitur ini dipasang ikut muncul.
--   3. Tidak mungkin melenceng: bila barisnya dihapus, kabarnya ikut hilang.
--
-- Satu workspace = satu ruang chat. `user_id` adalah PEMILIK workspace, persis
-- seperti tabel data lain, jadi anggota yang bekerja di dua perusahaan otomatis
-- melihat dua ruang yang terpisah tanpa kolom tambahan.
--
-- Jalankan sekali di Supabase SQL Editor, SETELAH migration_team.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  -- Pemilik workspace = identitas ruang chatnya.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Penulis. Namanya DISALIN, tidak hanya di-join: anggota bisa keluar dari tim
  -- dan barisnya masih harus terbaca "dikirim oleh Pak Yono", bukan berubah
  -- menjadi kosong dan membuat riwayat lama kehilangan arti.
  penulis_id uuid references auth.users(id) on delete set null,
  penulis_nama text not null default '',
  penulis_role text not null default '',

  teks text not null default '',
  -- Foto lapangan (data URL, sudah dikecilkan di klien). Ditaruh di kolom
  -- terpisah, bukan disisipkan ke `teks`, supaya pesan tetap bisa dicari.
  foto text[] not null default '{}',

  -- Proyek yang sedang dibicarakan. Kosong = obrolan umum workspace.
  project_name text not null default '',
  -- Membalas pesan lain. `set null` supaya menghapus satu pesan tidak
  -- menghapus balasannya — utas yang bolong lebih baik daripada utas yang hilang.
  balas_id uuid references public.team_messages(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists idx_chat_tim_ws on public.team_messages(user_id, created_at desc);
create index if not exists idx_chat_tim_penulis on public.team_messages(user_id, penulis_id);

-- ── RLS: pemilik + anggota tim aktif ────────────────────────────────────────
alter table public.team_messages enable row level security;

drop policy if exists "chat_tim_baca" on public.team_messages;
create policy "chat_tim_baca" on public.team_messages
  for select using (auth.uid() = user_id or public.is_team_member(user_id));

-- Menulis: hanya atas nama diri sendiri. Tanpa syarat `penulis_id = auth.uid()`
-- seorang anggota bisa mengirim pesan seolah-olah ditulis rekannya, dan seluruh
-- gunanya sebagai dasar penilaian KPI langsung runtuh.
drop policy if exists "chat_tim_tulis" on public.team_messages;
create policy "chat_tim_tulis" on public.team_messages
  for insert with check (
    (auth.uid() = user_id or public.is_team_member(user_id))
    and penulis_id = auth.uid()
  );

-- Menghapus: pesan sendiri, atau pemilik workspace membersihkan ruangnya.
-- Sengaja tidak ada policy UPDATE: pesan yang bisa diubah diam-diam tidak lagi
-- bisa dijadikan bukti apa yang pernah disepakati.
drop policy if exists "chat_tim_hapus" on public.team_messages;
create policy "chat_tim_hapus" on public.team_messages
  for delete using (auth.uid() = user_id or penulis_id = auth.uid());

-- ── Ringkasan keaktifan per anggota (bahan KPI) ─────────────────────────────
-- Dihitung di server supaya menilai satu tim tidak perlu mengunduh seluruh
-- riwayat percakapannya ke perangkat. Jendela harinya ditentukan pemanggil.
drop function if exists public.chat_tim_keaktifan(uuid, integer);
create or replace function public.chat_tim_keaktifan(p_owner uuid, p_hari integer default 30)
returns table (
  penulis_id uuid,
  penulis_nama text,
  penulis_role text,
  jumlah bigint,
  hari_aktif bigint,
  terakhir timestamptz
)
language sql security definer stable set search_path = public as $$
  select m.penulis_id,
         -- Nama terakhir yang dipakai orang ini; nama bisa berubah, dan yang
         -- ditampilkan sebaiknya yang paling mutakhir.
         (array_agg(m.penulis_nama order by m.created_at desc))[1] as penulis_nama,
         (array_agg(m.penulis_role order by m.created_at desc))[1] as penulis_role,
         count(*) as jumlah,
         count(distinct date_trunc('day', m.created_at)) as hari_aktif,
         max(m.created_at) as terakhir
    from team_messages m
   where m.user_id = p_owner
     and (p_owner = auth.uid() or public.is_team_member(p_owner))
     and m.created_at >= now() - make_interval(days => greatest(1, p_hari))
   group by m.penulis_id
   order by count(*) desc;
$$;

revoke all on function public.chat_tim_keaktifan(uuid, integer) from public;
grant execute on function public.chat_tim_keaktifan(uuid, integer) to authenticated;
