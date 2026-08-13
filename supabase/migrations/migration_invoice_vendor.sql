-- ============================================================
-- PropFS — Vendor mengirim invoice sendiri lewat tautan
--
-- Sampai sekarang alurnya berhenti setelah PO dikirim: barang datang dicatat
-- lewat surat jalan, pembayaran dicatat manual, tetapi TAGIHAN dari vendor
-- tidak pernah masuk ke sistem. Ia beredar sebagai foto di WhatsApp, dan yang
-- memutuskan kapan dibayar harus mencarinya kembali di gulungan chat.
--
-- Migrasi ini memberi tiap PO yang dikirim satu tautan kedua: tautan tempat
-- vendor mengunggah invoice-nya. Vendor tidak punya akun dan tidak akan pernah
-- punya, jadi seluruh jalurnya lewat RPC SECURITY DEFINER yang di-grant ke
-- `anon` — pola yang sama dengan tautan PO dan pendaftaran vendor.
--
-- Aman dijalankan berulang kali.
--
-- Jalankan di Supabase SQL Editor SETELAH:
--   migration_procurement.sql, migration_token_pendek.sql
-- ============================================================

-- ── Tautan kedua pada PO ────────────────────────────────────────────────────
-- Dipisahkan dari view_token dengan sengaja. Keduanya memberi kuasa yang
-- berbeda: view_token hanya MEMBACA, invoice_token MENULIS ke basis data kami
-- dan memakai kuota AI kami. Menyatukannya berarti siapa pun yang pernah
-- diteruskan tautan PO — dan tautan WhatsApp memang sering diteruskan — ikut
-- bisa menulis.
alter table public.purchase_orders
  add column if not exists invoice_token text,
  add column if not exists invoice_token_at timestamptz,
  -- Jatah pemakaian AI untuk tautan ini. Tanpa batas, satu tautan yang bocor
  -- menjadi pintu memakai kunci Gemini kami sepuasnya.
  add column if not exists invoice_ai_terpakai int not null default 0;

create unique index if not exists purchase_orders_invoice_token_key
  on public.purchase_orders (invoice_token) where invoice_token is not null;

-- ── Tagihan yang masuk ──────────────────────────────────────────────────────
create table if not exists public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  -- Pemilik workspace. Diambil dari PO-nya, tidak pernah dari pengirim:
  -- pengirimnya anonim, dan membiarkannya menentukan pemilik berarti
  -- membiarkan siapa pun menaruh baris di workspace mana pun.
  user_id uuid not null references auth.users(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  -- Salinan, sama alasannya dengan salinan di purchase_orders: tagihan yang
  -- sudah masuk tidak boleh berubah isinya ketika data induknya diperbarui.
  po_nomor text not null default '',
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_nama text not null default '',
  project_name text default '',

  nomor_invoice text default '',
  tanggal date,
  jatuh_tempo date,
  -- [{nama, satuan, qty, harga, subtotal}]
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  ppn numeric not null default 0,
  total numeric not null default 0,
  catatan text default '',
  dikirim_oleh text default '',

  -- Berkas aslinya ikut disimpan sebagai data URI.
  --
  -- Hasil bacaan AI tidak pernah cukup sebagai bukti: yang menyetujui
  -- pembayaran perlu melihat dokumen yang sebenarnya, dan tanpa itu satu salah
  -- baca menjadi salah bayar yang tidak bisa ditelusuri. Foto sudah dikecilkan
  -- di sisi vendor sebelum dikirim.
  berkas_nama text default '',
  berkas_mime text default '',
  berkas_data text,

  status text not null default 'masuk'
    check (status in ('masuk', 'cocok', 'selisih', 'disetujui', 'ditolak', 'dibayar')),
  catatan_periksa text default '',
  diperiksa_oleh text default '',
  diperiksa_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists vendor_invoices_user_idx on public.vendor_invoices (user_id, created_at desc);
create index if not exists vendor_invoices_po_idx on public.vendor_invoices (po_id);

alter table public.vendor_invoices enable row level security;

drop policy if exists vendor_invoices_rw on public.vendor_invoices;
create policy vendor_invoices_rw on public.vendor_invoices
  for all using (auth.uid() = user_id or public.is_team_member(user_id))
  with check (auth.uid() = user_id or public.is_team_member(user_id));

-- ── Menerbitkan tautan invoice saat PO dikirim ──────────────────────────────
-- Dipanggil pemilik/tim yang sudah masuk, bukan anon.
create or replace function public.po_terbitkan_invoice_token(p_po_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  t text;
begin
  -- Token BARU pada tiap penerbitan. Tautan yang lama ikut mati, dan itu
  -- memang yang diinginkan: kuasa menulis tidak boleh menumpuk di tangan
  -- salinan-salinan pesan lama yang sudah tersebar entah ke mana.
  t := public.buat_token_pendek(12);
  update purchase_orders
     set invoice_token = t,
         invoice_token_at = now(),
         invoice_ai_terpakai = 0
   where id = p_po_id
     and (user_id = auth.uid() or public.is_team_member(user_id));
  if not found then return null; end if;
  return t;
end $$;

-- ── Yang dilihat vendor ketika membuka tautannya ────────────────────────────
create or replace function public.invoice_form_by_token(p_token text)
returns table (
  po_nomor text, vendor_nama text, project_name text,
  term text, term_hari int, items jsonb, total numeric,
  sudah_dikirim int
)
language sql security definer stable set search_path = public as $$
  select p.nomor, p.vendor_nama, p.project_name,
         p.term, p.term_hari, p.items, p.total,
         (select count(*)::int from vendor_invoices vi where vi.po_id = p.id)
  from purchase_orders p
  where p.invoice_token = p_token
    and p_token is not null and length(p_token) >= 8
    and p.status in ('terkirim', 'selesai')
  limit 1;
$$;

-- ── Izin memakai AI, sekaligus penghitungnya ────────────────────────────────
--
-- Memeriksa dan menaikkan penghitung dalam SATU pernyataan. Bila dipisah
-- menjadi "tanya dulu, catat kemudian", dua permintaan yang datang bersamaan
-- sama-sama membaca angka lama dan batasnya bisa dilewati; di sinilah
-- tagihannya yang jatuh ke kami.
create or replace function public.invoice_ai_boleh(p_token text, p_batas int default 12)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  sisa int;
begin
  if p_token is null or length(p_token) < 8 then return false; end if;
  update purchase_orders
     set invoice_ai_terpakai = invoice_ai_terpakai + 1
   where invoice_token = p_token
     and status in ('terkirim', 'selesai')
     and invoice_ai_terpakai < greatest(1, coalesce(p_batas, 12))
  returning invoice_ai_terpakai into sisa;
  return sisa is not null;
end $$;

-- ── Vendor mengirim tagihannya ──────────────────────────────────────────────
create or replace function public.invoice_kirim(p_token text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  po purchase_orders%rowtype;
  berkas text;
  id_baru uuid;
begin
  if p_token is null or length(p_token) < 8 then return null; end if;

  select * into po from purchase_orders
   where invoice_token = p_token and status in ('terkirim', 'selesai') limit 1;
  if not found then return null; end if;

  -- Satu tautan, satu tagihan per PO — kecuali yang sebelumnya sudah ditolak.
  -- Tanpa ini, satu tautan bisa membanjiri daftar dengan ratusan baris.
  if exists (select 1 from vendor_invoices
              where po_id = po.id and status <> 'ditolak') then
    return null;
  end if;

  berkas := coalesce(p_data->>'berkas_data', '');
  -- Berkas yang kelewat besar ditolak di sini, bukan setelah baris masuk.
  if length(berkas) > 3000000 then berkas := ''; end if;

  insert into vendor_invoices (
    user_id, po_id, po_nomor, vendor_id, vendor_nama, project_name,
    nomor_invoice, tanggal, jatuh_tempo, items, subtotal, ppn, total,
    catatan, dikirim_oleh, berkas_nama, berkas_mime, berkas_data, status
  ) values (
    po.user_id, po.id, po.nomor, po.vendor_id, po.vendor_nama, po.project_name,
    left(coalesce(p_data->>'nomor_invoice', ''), 80),
    nullif(p_data->>'tanggal', '')::date,
    nullif(p_data->>'jatuh_tempo', '')::date,
    coalesce(p_data->'items', '[]'::jsonb),
    coalesce((p_data->>'subtotal')::numeric, 0),
    coalesce((p_data->>'ppn')::numeric, 0),
    coalesce((p_data->>'total')::numeric, 0),
    left(coalesce(p_data->>'catatan', ''), 500),
    left(coalesce(p_data->>'dikirim_oleh', ''), 80),
    left(coalesce(p_data->>'berkas_nama', ''), 200),
    left(coalesce(p_data->>'berkas_mime', ''), 80),
    nullif(berkas, ''),
    'masuk'
  ) returning id into id_baru;

  -- Tautannya dipakai habis. Kuasa menulis yang tetap hidup setelah dipakai
  -- adalah kuasa yang menunggu disalahgunakan.
  update purchase_orders set invoice_token = null where id = po.id;

  return id_baru;
end $$;

revoke all on function public.invoice_form_by_token(text) from public;
revoke all on function public.invoice_ai_boleh(text, int) from public;
revoke all on function public.invoice_kirim(text, jsonb) from public;
revoke all on function public.po_terbitkan_invoice_token(uuid) from public;

grant execute on function public.invoice_form_by_token(text) to anon, authenticated;
grant execute on function public.invoice_ai_boleh(text, int) to anon, authenticated;
grant execute on function public.invoice_kirim(text, jsonb) to anon, authenticated;
grant execute on function public.po_terbitkan_invoice_token(uuid) to authenticated;
