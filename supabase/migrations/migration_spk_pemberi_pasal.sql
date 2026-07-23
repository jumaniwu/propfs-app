-- ============================================================
-- PropFS — Kontraktor AI: SPK jadi kontrak proper
-- Tambah tanda tangan Pemberi Kerja (Pihak Pertama) + pasal
-- (isi dokumen yang bisa diedit). Jalankan sekali di Supabase.
-- ============================================================

alter table public.spk_docs
  add column if not exists pemberi_nama text default '',
  add column if not exists pemberi_jabatan text default '',
  add column if not exists pemberi_signature text,
  add column if not exists pemberi_signed_name text,
  add column if not exists pemberi_signed_at timestamptz,
  add column if not exists pasal jsonb not null default '[]'::jsonb,  -- [{judul, isi}]
  -- SPK bisa ditujukan ke Pelaksana/Vendor ATAU ke Konsumen/Pemilik
  add column if not exists pihak_kedua_peran text default 'Pelaksana',
  -- Lampiran RAB / Surat Penawaran Harga (data URL: PDF atau gambar)
  add column if not exists lampiran_nama text,
  add column if not exists lampiran_data text;

-- Perbarui RPC token publik agar halaman tanda tangan pihak kedua ikut
-- menampilkan pasal, tanda tangan pemberi kerja, peran, dan lampiran.
-- DROP dulu: Postgres tidak bisa mengganti tipe/kolom return via CREATE OR REPLACE.
drop function if exists public.spk_get_by_token(text);
create or replace function public.spk_get_by_token(p_token text)
returns table (
  nomor text, project_name text, vendor_name text,
  lingkup jsonb, nilai_kontrak numeric, termin jsonb,
  tgl_mulai date, durasi_hari int, denda_permil numeric, catatan text,
  status text, signature_data text, signed_name text, signed_at timestamptz,
  created_at timestamptz,
  pemberi_nama text, pemberi_jabatan text, pemberi_signature text,
  pemberi_signed_name text, pemberi_signed_at timestamptz, pasal jsonb,
  pihak_kedua_peran text, lampiran_nama text, lampiran_data text
) language sql security definer set search_path = public as $$
  select nomor, project_name, vendor_name, lingkup, nilai_kontrak, termin,
         tgl_mulai, durasi_hari, denda_permil, catatan,
         status, signature_data, signed_name, signed_at, created_at,
         pemberi_nama, pemberi_jabatan, pemberi_signature,
         pemberi_signed_name, pemberi_signed_at, pasal,
         pihak_kedua_peran, lampiran_nama, lampiran_data
  from spk_docs where sign_token = p_token;
$$;

grant execute on function public.spk_get_by_token(text) to anon, authenticated;
