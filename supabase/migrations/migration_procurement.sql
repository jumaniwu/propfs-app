-- ============================================================
-- PropFS — Kontraktor AI: Modul Procurement
--
-- Menyambung ujung alur Material Request yang tadinya berhenti setelah
-- disetujui. Sekarang: request disetujui → dipilih di dalam Purchase Order →
-- PO diterbitkan, ditandatangani pembuat, disetujui Owner/Manajemen/PM →
-- dikirim ke vendor lewat tautan WhatsApp.
--
-- Vendor mendaftar sendiri lewat tautan publik milik tiap perusahaan, mengisi
-- profil + nomor WA + daftar barang beserta harga jual dan term payment.
--
-- Jalankan sekali di Supabase SQL Editor, SETELAH:
--   migration_material.sql, migration_team.sql, migration_company_profile.sql
-- ============================================================

-- ── 1. Tautan registrasi vendor per perusahaan ──────────────────────────────
-- Sengaja TIDAK memakai company_profiles.kode: kode itu dipakai karyawan untuk
-- login di /tim/masuk, jadi jangan disebar ke vendor luar. Token ini terpisah
-- dan bisa diputar ulang bila bocor.
alter table public.company_profiles
  add column if not exists vendor_token text;

update public.company_profiles
   set vendor_token = replace(gen_random_uuid()::text, '-', '')
 where vendor_token is null or vendor_token = '';

create unique index if not exists idx_company_vendor_token
  on public.company_profiles(vendor_token) where vendor_token is not null;

-- ── 2. Vendor ───────────────────────────────────────────────────────────────
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  pic text default '',                     -- nama orang yang dihubungi
  no_wa text default '',
  email text default '',
  alamat text default '',
  npwp text default '',
  kategori text default '',                -- mis. "Besi & Baja", "Semen"
  term text not null default 'cash'
    check (term in ('cash', 'term')),
  term_hari int not null default 0,        -- lama tempo bila term
  catatan text default '',
  -- 'baru' = mendaftar sendiri lewat tautan, belum diverifikasi admin.
  -- Hanya vendor 'aktif' yang boleh dipilih saat membuat PO.
  status text not null default 'baru'
    check (status in ('baru', 'aktif', 'nonaktif')),
  -- Token pribadi vendor untuk kembali memperbarui daftar barangnya.
  self_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create index if not exists idx_vendors_user on public.vendors(user_id, status);

-- ── 3. Barang yang ditawarkan vendor (katalog) ──────────────────────────────
-- user_id ikut disimpan (denormalisasi) supaya kebijakan RLS tidak perlu
-- menembus tabel vendors setiap kali membaca.
create table if not exists public.vendor_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  nama text not null,
  satuan text default '',
  harga numeric not null default 0,        -- harga jual vendor
  merek text default '',
  min_order numeric default 0,
  catatan text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_items_user on public.vendor_items(user_id);
create index if not exists idx_vendor_items_vendor on public.vendor_items(vendor_id);

-- ── 4. Purchase Order ───────────────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nomor text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  -- Nama & WA vendor disimpan sebagai salinan: PO yang sudah terbit tidak
  -- boleh berubah isinya walau data vendor diperbarui atau vendor dihapus.
  vendor_nama text not null default '',
  vendor_wa text default '',
  project_name text default '',
  tanggal date not null default current_date,
  butuh_tanggal date,
  term text not null default 'cash'
    check (term in ('cash', 'term')),
  term_hari int not null default 0,
  -- [{request_id, nama, satuan, qty, harga, subtotal}] — harga juga salinan.
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  ppn_pct numeric not null default 0,
  ppn numeric not null default 0,
  total numeric not null default 0,
  catatan text default '',
  status text not null default 'draft'
    check (status in ('draft', 'menunggu_approval', 'disetujui', 'terkirim', 'ditolak', 'selesai')),
  -- Tanda tangan pembuat PO
  pembuat_nama text default '',
  pembuat_jabatan text default '',
  pembuat_signature text,                  -- data URL PNG
  pembuat_signed_at timestamptz,
  -- Persetujuan Owner / Manajemen / Project Manager
  approver_nama text default '',
  approver_jabatan text default '',
  approver_signature text,
  approver_signed_at timestamptz,
  catatan_approval text default '',
  -- Tautan publik: vendor melihat PO & mengunduh PDF-nya dari pesan WA.
  view_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  terkirim_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_po_user on public.purchase_orders(user_id, created_at desc);

-- ── 5. Qty yang sudah dipesan pada tiap Material Request ────────────────────
-- Satu request boleh dipesan sebagian dan dipecah ke beberapa vendor, jadi
-- yang dicatat adalah akumulasi qty terpesan — bukan sekadar penanda ya/tidak.
alter table public.material_requests
  add column if not exists qty_dipesan numeric not null default 0;

-- ── 6. RLS: pemilik + anggota tim aktif ─────────────────────────────────────
alter table public.vendors enable row level security;
alter table public.vendor_items enable row level security;
alter table public.purchase_orders enable row level security;

drop policy if exists "vendors_owner" on public.vendors;
create policy "vendors_owner" on public.vendors
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

drop policy if exists "vendor_items_owner" on public.vendor_items;
create policy "vendor_items_owner" on public.vendor_items
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

drop policy if exists "po_owner" on public.purchase_orders;
create policy "po_owner" on public.purchase_orders
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- ============================================================
-- Akses pihak luar tanpa login — SECURITY DEFINER, pola sama dengan
-- spk_get_by_token di migration_kontraktor_spk_opname.sql
-- ============================================================

-- ── Vendor mendaftar lewat tautan perusahaan ────────────────────────────────
-- Profil dan daftar barang dikirim sekaligus dalam satu panggilan, supaya
-- vendor tidak perlu dua langkah. Mengembalikan self_token agar vendor bisa
-- kembali memperbarui barangnya nanti.
create or replace function public.vendor_daftar(
  p_token text, p_profil jsonb, p_items jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  pemilik uuid;
  vendor uuid;
  token text;
  it jsonb;
begin
  select c.user_id into pemilik
    from company_profiles c where c.vendor_token = p_token;
  if pemilik is null then return null; end if;

  if coalesce(trim(p_profil ->> 'nama'), '') = '' then return null; end if;

  insert into vendors (
    user_id, nama, pic, no_wa, email, alamat, npwp, kategori,
    term, term_hari, catatan, status
  ) values (
    pemilik,
    trim(p_profil ->> 'nama'),
    coalesce(p_profil ->> 'pic', ''),
    coalesce(p_profil ->> 'no_wa', ''),
    coalesce(p_profil ->> 'email', ''),
    coalesce(p_profil ->> 'alamat', ''),
    coalesce(p_profil ->> 'npwp', ''),
    coalesce(p_profil ->> 'kategori', ''),
    case when (p_profil ->> 'term') = 'term' then 'term' else 'cash' end,
    coalesce((p_profil ->> 'term_hari')::int, 0),
    coalesce(p_profil ->> 'catatan', ''),
    'baru'
  ) returning id, self_token into vendor, token;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(trim(it ->> 'nama'), '') <> '' then
      insert into vendor_items (user_id, vendor_id, nama, satuan, harga, merek, min_order, catatan)
      values (
        pemilik, vendor, trim(it ->> 'nama'),
        coalesce(it ->> 'satuan', ''),
        coalesce((it ->> 'harga')::numeric, 0),
        coalesce(it ->> 'merek', ''),
        coalesce((it ->> 'min_order')::numeric, 0),
        coalesce(it ->> 'catatan', '')
      );
    end if;
  end loop;

  return token;
end $$;

-- Nama perusahaan pemilik tautan, untuk ditampilkan di halaman registrasi.
-- Hanya nama; user_id tidak dibuka.
create or replace function public.perusahaan_by_vendor_token(p_token text)
returns table (nama_perusahaan text)
language sql security definer stable set search_path = public as $$
  select coalesce(nullif(c.nama_perusahaan, ''), 'Perusahaan')
  from company_profiles c where c.vendor_token = p_token limit 1;
$$;

-- ── Vendor kembali mengelola barangnya ──────────────────────────────────────
create or replace function public.vendor_by_self_token(p_token text)
returns table (
  nama text, pic text, no_wa text, email text, alamat text, npwp text,
  kategori text, term text, term_hari int, status text, items jsonb
)
language sql security definer stable set search_path = public as $$
  select v.nama, v.pic, v.no_wa, v.email, v.alamat, v.npwp,
         v.kategori, v.term, v.term_hari, v.status,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'nama', i.nama, 'satuan', i.satuan, 'harga', i.harga,
             'merek', i.merek, 'min_order', i.min_order, 'catatan', i.catatan
           ) order by i.nama)
           from vendor_items i where i.vendor_id = v.id
         ), '[]'::jsonb)
  from vendors v where v.self_token = p_token limit 1;
$$;

-- Daftar barang ditulis ulang seluruhnya: lebih sederhana dan tidak
-- meninggalkan baris yatim ketika vendor menghapus satu barang.
create or replace function public.vendor_item_simpan(p_token text, p_items jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  vendor uuid;
  pemilik uuid;
  it jsonb;
begin
  select v.id, v.user_id into vendor, pemilik
    from vendors v where v.self_token = p_token;
  if vendor is null then return false; end if;

  delete from vendor_items where vendor_id = vendor;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(trim(it ->> 'nama'), '') <> '' then
      insert into vendor_items (user_id, vendor_id, nama, satuan, harga, merek, min_order, catatan)
      values (
        pemilik, vendor, trim(it ->> 'nama'),
        coalesce(it ->> 'satuan', ''),
        coalesce((it ->> 'harga')::numeric, 0),
        coalesce(it ->> 'merek', ''),
        coalesce((it ->> 'min_order')::numeric, 0),
        coalesce(it ->> 'catatan', '')
      );
    end if;
  end loop;

  return true;
end $$;

-- ── Vendor membuka PO dari tautan WhatsApp ──────────────────────────────────
-- Hanya PO yang sudah dikirim yang boleh dilihat; draft dan yang belum
-- disetujui tidak bocor walau tautannya tersebar.
create or replace function public.po_get_by_token(p_token text)
returns table (
  nomor text, vendor_nama text, project_name text, tanggal date,
  butuh_tanggal date, term text, term_hari int, items jsonb,
  subtotal numeric, ppn_pct numeric, ppn numeric, total numeric,
  catatan text, status text,
  pembuat_nama text, pembuat_jabatan text, pembuat_signature text, pembuat_signed_at timestamptz,
  approver_nama text, approver_jabatan text, approver_signature text, approver_signed_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select p.nomor, p.vendor_nama, p.project_name, p.tanggal,
         p.butuh_tanggal, p.term, p.term_hari, p.items,
         p.subtotal, p.ppn_pct, p.ppn, p.total,
         p.catatan, p.status,
         p.pembuat_nama, p.pembuat_jabatan, p.pembuat_signature, p.pembuat_signed_at,
         p.approver_nama, p.approver_jabatan, p.approver_signature, p.approver_signed_at
  from purchase_orders p
  where p.view_token = p_token
    and p.status in ('terkirim', 'selesai')
  limit 1;
$$;

revoke all on function public.vendor_daftar(text, jsonb, jsonb) from public;
revoke all on function public.perusahaan_by_vendor_token(text) from public;
revoke all on function public.vendor_by_self_token(text) from public;
revoke all on function public.vendor_item_simpan(text, jsonb) from public;
revoke all on function public.po_get_by_token(text) from public;

grant execute on function public.vendor_daftar(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.perusahaan_by_vendor_token(text) to anon, authenticated;
grant execute on function public.vendor_by_self_token(text) to anon, authenticated;
grant execute on function public.vendor_item_simpan(text, jsonb) to anon, authenticated;
grant execute on function public.po_get_by_token(text) to anon, authenticated;

-- ── Tautan registrasi vendor milik pengguna yang sedang login ───────────────
create or replace function public.vendor_token_saya()
returns text language plpgsql security definer set search_path = public as $$
declare hasil text;
begin
  if auth.uid() is null then return null; end if;

  select c.vendor_token into hasil from company_profiles c where c.user_id = auth.uid();
  if hasil is not null and hasil <> '' then return hasil; end if;

  hasil := replace(gen_random_uuid()::text, '-', '');
  insert into company_profiles (user_id, vendor_token) values (auth.uid(), hasil)
    on conflict (user_id) do update set vendor_token = excluded.vendor_token
    where company_profiles.vendor_token is null or company_profiles.vendor_token = '';

  select c.vendor_token into hasil from company_profiles c where c.user_id = auth.uid();
  return hasil;
end $$;

revoke all on function public.vendor_token_saya() from public;
grant execute on function public.vendor_token_saya() to authenticated;

-- ── Tambah qty terpesan saat PO dikirim ─────────────────────────────────────
-- Dijalankan di server dalam satu transaksi supaya angka terpesan tidak
-- pernah setengah jadi bila jaringan terputus di tengah proses.
create or replace function public.po_tandai_terkirim(p_po_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  po record;
  it jsonb;
begin
  select * into po from purchase_orders
   where id = p_po_id
     and (user_id = auth.uid() or public.is_team_member(user_id));
  if po is null then return false; end if;

  -- Wajib sudah ditandatangani pembuat DAN disetujui.
  if po.pembuat_signature is null or po.approver_signature is null then
    return false;
  end if;
  if po.status = 'terkirim' or po.status = 'selesai' then return true; end if;

  for it in select * from jsonb_array_elements(po.items) loop
    if (it ->> 'request_id') is not null and (it ->> 'request_id') <> '' then
      update material_requests
         set qty_dipesan = least(qty, coalesce(qty_dipesan, 0) + coalesce((it ->> 'qty')::numeric, 0)),
             status = case
               when coalesce(qty_dipesan, 0) + coalesce((it ->> 'qty')::numeric, 0) >= qty
                 then 'dibeli' else status end
       where id = (it ->> 'request_id')::uuid
         and (user_id = auth.uid() or public.is_team_member(user_id));
    end if;
  end loop;

  update purchase_orders
     set status = 'terkirim', terkirim_at = now()
   where id = p_po_id;

  return true;
end $$;

revoke all on function public.po_tandai_terkirim(uuid) from public;
grant execute on function public.po_tandai_terkirim(uuid) to authenticated;
