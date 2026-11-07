-- ============================================================
-- PropFS — Langganan dan status invoice hanya diubah sistem pembayaran
--
-- ⚠️ JALANKAN SESUDAH, BUKAN SEBELUM.
--
-- Jalankan berkas ini HANYA setelah:
--   1. versi aplikasi yang memuat /api/verifikasi-bayar sudah ter-deploy
--      dan bisa dibuka (Vercel tidak sedang dijeda), dan
--   2. satu pembayaran percobaan berhasil mengaktifkan paketnya.
--
-- Sebelum versi itu ter-deploy, aktivasi paket masih bergantung pada
-- langkah yang dijalankan browser — dan berkas ini justru menghentikan
-- langkah itu. Dijalankan terlalu awal, pelanggan yang membayar tidak
-- mendapat paketnya sampai versi baru terpasang.
--
-- YANG DIPASANG.
--
-- subscriptions: hanya fungsi server (tanpa identitas pengguna) dan
-- superadmin yang boleh menambah, mengubah, atau menghapus langganan.
--
-- invoices: pengguna tetap boleh membuat invoice — itu langkah pertama
-- membeli — tetapi selalu berstatus 'pending' dan belum lunas. Kolom yang
-- menentukan uang dan paket (status, nilai, paket, periode, data Midtrans,
-- catatan tinjauan) tidak bisa diubah pengguna sesudahnya.
--
-- Kolom dibaca lewat to_jsonb dan diisi lewat jsonb_populate_record, tidak
-- pernah lewat NEW.nama_kolom: tabel invoices dibuat oleh beberapa migrasi
-- berbeda dan tidak semuanya punya notes atau midtrans_transaction_id.
-- Menyebut kolom yang tidak ada lewat NEW membuat SETIAP pembelian gagal.
--
-- Tidak ada data yang dihapus atau diubah. Aman dijalankan berulang.
-- Membutuhkan: migration_kunci_keamanan.sql
-- ============================================================


-- ── 1. Langganan ────────────────────────────────────────────────────────────
create or replace function public.lindungi_langganan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Fungsi server (webhook, verifikasi pembayaran, cron) dan SQL Editor.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if exists (select 1 from profiles where id = auth.uid() and role = 'superadmin') then
    return coalesce(new, old);
  end if;
  raise exception 'Langganan hanya bisa diubah oleh sistem pembayaran.'
    using errcode = '42501';
end $$;

drop trigger if exists trg_lindungi_langganan on public.subscriptions;
create trigger trg_lindungi_langganan
  before insert or update or delete on public.subscriptions
  for each row execute function public.lindungi_langganan();


-- ── 2. Invoice ──────────────────────────────────────────────────────────────
create or replace function public.lindungi_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  baru jsonb := to_jsonb(new);
  lama jsonb;
  kolom text;
  terjaga constant text[] := array[
    'status', 'paid_at', 'total_idr', 'subtotal_idr', 'ppn_idr',
    'plan_id', 'user_id', 'period_start', 'period_end', 'product',
    'midtrans_order_id', 'midtrans_transaction_id', 'payment_method', 'notes'
  ];
begin
  if auth.uid() is null then
    return new;
  end if;
  if exists (select 1 from profiles where id = auth.uid() and role = 'superadmin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Invoice baru dari pengguna selalu belum lunas, apa pun yang dikirim.
    -- Kunci yang kolomnya tidak ada diabaikan jsonb_populate_record.
    new := jsonb_populate_record(new, jsonb_build_object(
      'status', 'pending', 'paid_at', null, 'payment_method', null,
      'midtrans_order_id', null, 'midtrans_transaction_id', null, 'notes', null));
    return new;
  end if;

  lama := to_jsonb(old);
  foreach kolom in array terjaga loop
    if (baru -> kolom) is distinct from (lama -> kolom) then
      raise exception 'Kolom % pada invoice hanya bisa diubah oleh sistem pembayaran.', kolom
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_lindungi_invoice on public.invoices;
create trigger trg_lindungi_invoice
  before insert or update on public.invoices
  for each row execute function public.lindungi_invoice();
