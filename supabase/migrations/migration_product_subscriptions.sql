-- ============================================================
-- PropFS — Pisahkan sistem langganan per produk
-- Feasibility Study dan Kontraktor AI menjadi dua langganan terpisah:
-- pelanggan bisa berlangganan salah satu saja, atau keduanya dengan paket
-- dan masa aktif yang berbeda.
--
-- AMAN UNTUK DATA LAMA: kolom `product` dibiarkan NULL pada langganan yang
-- sudah berjalan. Aplikasi memperlakukan langganan tanpa `product` sebagai
-- mencakup KEDUA produk, sehingga tidak ada pelanggan yang kehilangan akses.
-- Tandai barisnya (UPDATE di bagian bawah) hanya bila Anda memang ingin
-- membatasi langganan lama ke satu produk saja.
--
-- Jalankan sekali di Supabase SQL Editor.
-- ============================================================

-- ── 1. Paket: tandai paket milik produk apa ─────────────────────────────────
alter table public.subscription_plans
  add column if not exists product text
  check (product is null or product in ('feasibility', 'kontraktor'));

comment on column public.subscription_plans.product is
  'Produk pemilik paket. NULL = paket lama yang berlaku untuk semua produk.';

-- ── 2. Langganan: satu baris per produk per pengguna ────────────────────────
alter table public.subscriptions
  add column if not exists product text
  check (product is null or product in ('feasibility', 'kontraktor'));

comment on column public.subscriptions.product is
  'Produk yang dilanggan. NULL = langganan lama yang mencakup semua produk.';

-- Cegah dua langganan aktif untuk produk yang sama pada satu pengguna.
-- Baris lama (product NULL) tidak ikut dibatasi indeks ini.
create unique index if not exists uniq_active_sub_per_product
  on public.subscriptions (user_id, product)
  where status = 'active' and product is not null;

create index if not exists idx_subscriptions_user_product
  on public.subscriptions (user_id, product, status);

-- ── 3. Invoice: catat produk apa yang dibeli ────────────────────────────────
alter table public.invoices
  add column if not exists product text
  check (product is null or product in ('feasibility', 'kontraktor'));

comment on column public.invoices.product is
  'Produk yang dibeli pada invoice ini. NULL = invoice lama sebelum pemisahan produk.';

-- ── 4. (Opsional) Tandai paket bawaan ke produknya ──────────────────────────
-- Sesuaikan dengan katalog paket Anda sendiri sebelum menjalankan bagian ini.
-- update public.subscription_plans set product = 'feasibility' where id in ('free', 'basic', 'pro');

-- ── 5. (Opsional) Kunci langganan lama ke satu produk ───────────────────────
-- JANGAN dijalankan kecuali Anda memang ingin mencabut akses produk lain dari
-- pelanggan yang sudah berjalan.
-- update public.subscriptions set product = 'feasibility'
--   where product is null and status = 'active';
