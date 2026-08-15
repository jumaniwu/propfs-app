-- ============================================================
-- PropFS — Revisi PO, dan alamat pengiriman di dalam PO
--
-- DUA HAL, SATU MIGRASI, karena keduanya menyentuh tabel yang sama dan
-- dijalankan sekali oleh orang yang sama.
--
-- ── 1. REVISI ───────────────────────────────────────────────────────────────
--
-- Barang datang kurang dari yang dipesan, dan itu disepakati dengan vendornya.
-- Sampai sekarang PO-nya tetap berdiri di angka pesanan semula — artinya
-- tagihan vendor untuk barang yang benar-benar datang selamanya terbaca
-- "kurang bayar", dan sisa hutang yang tidak pernah ada itu ikut ke laporan.
--
-- Revisi dilakukan DI TEMPAT, pada baris PO yang sama. Bukan PO baru:
--   - Delivery Order dan pembayaran sudah menempel pada po_id ini. PO baru
--     akan memecah keduanya menjadi dua utas yang harus dijumlahkan tangan.
--   - Nomor PO sudah tersebar di WhatsApp vendor. Nomor baru untuk barang yang
--     sama membuat vendor mengira ada pesanan tambahan.
--
-- Yang lama TIDAK hilang: keadaan sebelum tiap revisi disimpan utuh di
-- revisi_riwayat. Dokumen yang mengubah jumlah uang harus bisa ditelusuri.
--
-- ── 2. ALAMAT PENGIRIMAN ────────────────────────────────────────────────────
--
-- PO selama ini tidak menyebutkan ke mana barangnya diantar. Sopir vendor
-- menelepon menanyakannya, atau lebih buruk: membongkar di proyek yang salah.
-- ============================================================

-- ── Revisi ──────────────────────────────────────────────────────────────────

-- Berapa kali PO ini direvisi. 0 = belum pernah; nomor tampilnya polos.
alter table public.purchase_orders
  add column if not exists revisi_ke integer not null default 0;

-- Keadaan SEBELUM tiap revisi, satu elemen per revisi:
--   { "ke":1, "pada":"2026-08-15T…", "oleh":"Indra", "alasan":"Kayu 2x2 datang 2 dari 5",
--     "items":[…], "subtotal":…, "ppn":…, "total":… }
alter table public.purchase_orders
  add column if not exists revisi_riwayat jsonb not null default '[]'::jsonb;

-- Alasan revisi TERAKHIR, dipisah supaya bisa ditampilkan di kartu dan dicetak
-- di PDF tanpa membongkar riwayat.
alter table public.purchase_orders
  add column if not exists revisi_alasan text not null default '';

-- ── Alamat pengiriman ───────────────────────────────────────────────────────
--
-- Disalin ke dalam PO, TIDAK dibaca dari proyek saat dicetak. PO adalah surat
-- yang sudah dikirim; alamat proyek yang diperbaiki bulan depan tidak boleh
-- diam-diam mengubah isi surat yang sudah diterima vendor tahun lalu.
alter table public.purchase_orders
  add column if not exists kirim_nama text not null default '';
alter table public.purchase_orders
  add column if not exists kirim_wa text not null default '';
alter table public.purchase_orders
  add column if not exists kirim_alamat text not null default '';
-- Patokan jalan, jam bongkar, "lewat gerbang belakang" — hal yang menentukan
-- apakah barangnya sampai hari itu juga.
alter table public.purchase_orders
  add column if not exists kirim_catatan text not null default '';

-- ── Revisi PO dalam satu transaksi ─────────────────────────────────────────
--
-- Dijadikan satu fungsi, bukan dua PATCH dari klien: menyimpan riwayat lalu
-- mengganti item adalah dua tulisan yang TIDAK BOLEH berhasil separuh. Bila
-- koneksi putus di antaranya, yang tersisa adalah PO dengan angka baru tanpa
-- jejak angka lamanya — persis keadaan yang membuat orang tidak bisa
-- menjelaskan selisih ke vendor.
--
-- Approval ulang: hanya bila totalnya NAIK. Menurunkan PO agar cocok dengan
-- barang yang benar-benar datang adalah koreksi terhadap kenyataan, bukan
-- komitmen belanja baru. Menaikkannya adalah pesanan tambahan, dan itu memang
-- perlu tanda tangan kedua.
create or replace function public.po_revisi(
  p_po_id uuid,
  p_items jsonb,
  p_subtotal numeric,
  p_ppn numeric,
  p_total numeric,
  p_alasan text,
  p_oleh text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_po purchase_orders%rowtype;
  v_ke integer;
  v_status text;
begin
  select * into v_po from purchase_orders where id = p_po_id;
  if v_po.id is null then
    raise exception 'PO tidak ditemukan';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Revisi harus memuat minimal satu barang';
  end if;
  if coalesce(length(btrim(p_alasan)), 0) < 3 then
    raise exception 'Alasan revisi harus diisi';
  end if;

  v_ke := coalesce(v_po.revisi_ke, 0) + 1;

  v_status := case
    when p_total > coalesce(v_po.total, 0) then 'menunggu_approval'
    else v_po.status
  end;

  update purchase_orders set
    revisi_ke = v_ke,
    revisi_alasan = btrim(p_alasan),
    revisi_riwayat = coalesce(revisi_riwayat, '[]'::jsonb) || jsonb_build_object(
      'ke', v_ke,
      'pada', now(),
      'oleh', coalesce(nullif(btrim(p_oleh), ''), 'Tidak diketahui'),
      'alasan', btrim(p_alasan),
      'items', coalesce(v_po.items, '[]'::jsonb),
      'subtotal', coalesce(v_po.subtotal, 0),
      'ppn', coalesce(v_po.ppn, 0),
      'total', coalesce(v_po.total, 0)
    ),
    items = p_items,
    subtotal = p_subtotal,
    ppn = p_ppn,
    total = p_total,
    status = v_status,
    -- Tanda tangan penyetuju dicabut HANYA bila persetujuannya memang harus
    -- diulang. Mencabutnya pada koreksi turun berarti menghapus tanda tangan
    -- sah atas dokumen yang isinya tidak bertambah.
    approver_signature = case when v_status = 'menunggu_approval' then null else approver_signature end,
    approver_signed_at = case when v_status = 'menunggu_approval' then null else approver_signed_at end
  where id = p_po_id;

  return jsonb_build_object('revisi_ke', v_ke, 'status', v_status);
end;
$$;

revoke all on function public.po_revisi(uuid, jsonb, numeric, numeric, numeric, text, text) from public;
grant execute on function public.po_revisi(uuid, jsonb, numeric, numeric, numeric, text, text) to authenticated;
