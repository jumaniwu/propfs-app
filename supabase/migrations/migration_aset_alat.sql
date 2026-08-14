-- ============================================================
-- PropFS — Aset & alat kerja perusahaan
--
-- Genset, scaffolding, mesin las, molen. Barang yang dibeli sekali lalu
-- dipakai bertahun-tahun di proyek yang berganti-ganti.
--
-- Sampai sekarang sistem ini hanya mengenal satu jenis "barang": material
-- proyek yang habis terpakai. Alat kerja bukan itu — ia tidak habis, dan
-- harganya tidak seluruhnya menjadi beban di bulan pembelian. Tanpa tabel
-- ini, genset 60 juta akan tercatat sebagai stok proyek yang tidak pernah
-- berkurang, dan labanya akan salah selama lima tahun.
--
-- Aman dijalankan berulang kali.
-- Jalankan SETELAH migration_procurement.sql.
-- ============================================================

create table if not exists public.aset_alat (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  nama         text not null,
  kode         text not null default '',
  merek        text not null default '',
  nomor_seri   text not null default '',

  tanggal_beli date not null default current_date,
  harga        numeric not null default 0,
  -- Umur ekonomis dalam bulan. 0 = sengaja tidak disusutkan (mis. tanah).
  umur_bulan   integer not null default 60,
  -- Nilai sisa saat umurnya habis; penyusutan berhenti di sini.
  nilai_residu numeric not null default 0,

  kondisi      text not null default 'baik'
               check (kondisi in ('baik', 'perlu_servis', 'rusak')),

  -- Di mana alat ini SEKARANG. NULL = di gudang.
  --
  -- Sengaja tanpa foreign key: proyek tinggal di `cost_projects` sebagai blob
  -- JSON milik pemakainya, bukan sebagai tabel berbaris. `lokasi_nama` adalah
  -- salinan namanya, dipakai hanya bila proyeknya sudah tidak ada lagi.
  lokasi_project_id text,
  lokasi_nama       text not null default '',
  pemegang          text not null default '',

  -- PO asal pembeliannya, bila dibeli lewat Procurement. `set null` supaya
  -- menghapus PO tidak ikut menghapus alatnya — barangnya tetap ada.
  po_id        uuid references public.purchase_orders(id) on delete set null,

  catatan      text not null default '',
  -- Terisi bila alat dijual atau dihapusbukukan. Penyusutannya berhenti, dan
  -- nilainya tidak lagi ikut menambah aset perusahaan.
  dilepas_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists aset_alat_user_idx on public.aset_alat(user_id);
create index if not exists aset_alat_lokasi_idx on public.aset_alat(lokasi_project_id);

alter table public.aset_alat enable row level security;

drop policy if exists "aset_alat_rw" on public.aset_alat;
create policy "aset_alat_rw" on public.aset_alat
  for all
  using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

comment on table public.aset_alat is
  'Alat kerja & barang modal perusahaan. Nilai bukunya (harga − penyusutan) '
  'masuk neraca sebagai aset tetap; yang membebani laba hanya penyusutannya.';
