-- ============================================================
-- PropFS — Kontraktor AI: Penerimaan Barang (DO) & Pembayaran PO
--
-- Menyambung ujung alur procurement yang tadinya berhenti setelah PO dikirim
-- ke vendor. Sekarang:
--
--   PO terkirim → barang datang, logistik mencatat DO (boleh bertahap)
--                → nomor nota & tanggalnya tercatat, jatuh tempo mulai berjalan
--                → keuangan melihat PO mana yang jatuh tempo / terlambat
--                → pembayaran dicatat (boleh dicicil) beserta bukti transfernya
--
-- Jalankan sekali di Supabase SQL Editor, SETELAH migration_procurement.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

-- ── 1. Penerimaan barang / Delivery Order ───────────────────────────────────
-- Satu PO boleh punya banyak DO: vendor sering mengirim bertahap, dan tiap
-- pengiriman membawa surat jalan serta notanya sendiri.
create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,

  nomor_do text not null default '',        -- nomor surat jalan dari vendor
  nomor_nota text not null default '',      -- nomor nota / invoice vendor
  -- Dasar perhitungan jatuh tempo. Dipilih tanggal NOTA, bukan tanggal PO
  -- maupun tanggal barang diterima, karena itulah tanggal tagihan resminya.
  tanggal_nota date,
  tanggal_terima date not null default current_date,
  penerima text not null default '',        -- yang menerima di lapangan

  -- [{nama, satuan, qty}] — qty yang BENAR-BENAR datang, bukan yang dipesan.
  items jsonb not null default '[]'::jsonb,
  catatan text not null default '',
  -- Foto surat jalan / nota (data URL, sudah dikecilkan di klien).
  foto text[] not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists idx_do_user on public.delivery_orders(user_id, tanggal_terima desc);
create index if not exists idx_do_po on public.delivery_orders(po_id);

-- ── 2. Pembayaran PO ────────────────────────────────────────────────────────
-- Boleh dicicil: DP dulu lalu pelunasan. Tiap pembayaran membawa buktinya
-- sendiri, jadi yang tercatat adalah riwayat, bukan sekadar penanda lunas.
create table if not exists public.po_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,

  tanggal date not null default current_date,
  jumlah numeric not null default 0,
  metode text not null default 'transfer'
    check (metode in ('transfer', 'tunai', 'giro', 'lainnya')),
  referensi text not null default '',       -- nomor referensi transfer
  bukti text,                               -- data URL foto/PDF bukti transfer
  catatan text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists idx_pay_user on public.po_payments(user_id, tanggal desc);
create index if not exists idx_pay_po on public.po_payments(po_id);

-- ── 3. RLS: pemilik + anggota tim aktif ─────────────────────────────────────
alter table public.delivery_orders enable row level security;
alter table public.po_payments enable row level security;

drop policy if exists "do_owner" on public.delivery_orders;
create policy "do_owner" on public.delivery_orders
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

drop policy if exists "pay_owner" on public.po_payments;
create policy "pay_owner" on public.po_payments
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- ── 4. Status PO mengikuti penerimaan ───────────────────────────────────────
-- 'selesai' berarti barangnya sudah datang lengkap. Ditandai di server dalam
-- satu panggilan supaya status PO dan pencatatan DO tidak pernah terpisah
-- ketika koneksi terputus di tengah jalan.
create or replace function public.po_tandai_selesai(p_po_id uuid, p_selesai boolean default true)
returns boolean
language plpgsql security definer set search_path = public as $$
declare po record;
begin
  select * into po from purchase_orders
   where id = p_po_id
     and (user_id = auth.uid() or public.is_team_member(user_id));
  if po is null then return false; end if;

  -- Hanya PO yang sudah dikirim ke vendor yang masuk akal ditandai selesai.
  if p_selesai and po.status <> 'terkirim' and po.status <> 'selesai' then
    return false;
  end if;

  update purchase_orders
     set status = case when p_selesai then 'selesai' else 'terkirim' end
   where id = p_po_id;
  return true;
end $$;

revoke all on function public.po_tandai_selesai(uuid, boolean) from public;
grant execute on function public.po_tandai_selesai(uuid, boolean) to authenticated;
