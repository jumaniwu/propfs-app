-- ============================================================
-- PropFS — Stok material di halaman laporan publik (/l/:token)
--
-- Saran nama material di halaman tukang tadinya diambil dari
-- `material_by_report_token`, yang menyaring dengan `log_id = field_log.id`.
-- Penyaring itu terlalu sempit untuk dipakai sebagai daftar inventori:
--
--   1. Request yang dibuat DARI DALAM aplikasi (halaman Material Lapangan)
--      tidak punya `log_id` sama sekali — kolom itu hanya diisi oleh RPC link
--      publik. Jadi semua material yang diminta lewat kantor tidak pernah
--      muncul sebagai saran, dan inilah sebab daftar sarannya kosong.
--   2. Satu proyek bisa punya lebih dari satu link laporan. Barang yang
--      dicatat lewat link lain seharusnya tetap dianggap barang proyek yang
--      sama.
--
-- Maka fungsi baru ini menyaring per PROYEK (user_id + project_name), bukan
-- per link. Yang dikembalikan sengaja hanya nama, satuan, qty, dan status —
-- bukan seluruh baris — karena halaman ini publik dan pelapor, catatan, serta
-- fotonya tidak ada gunanya untuk menghitung stok.
--
-- Penerimaan barang ikut dibaca dari Delivery Order supaya stok terisi dari
-- barang yang benar-benar datang, bukan hanya dari request yang sempat
-- ditandai "diterima" secara manual.
--
-- Jalankan di Supabase SQL Editor SETELAH migration_material.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

create or replace function public.material_stok_by_report_token(p_token text)
returns table (usage jsonb, requests jsonb, penerimaan jsonb)
language plpgsql security definer stable set search_path = public as $$
declare
  v_log   uuid;
  v_user  uuid;
  v_proj  text;
  v_usage jsonb := '[]'::jsonb;
  v_req   jsonb := '[]'::jsonb;
  v_do    jsonb := '[]'::jsonb;
begin
  select l.id, l.user_id, lower(trim(coalesce(l.project_name, '')))
    into v_log, v_user, v_proj
    from field_logs l
   where l.report_token = p_token;

  -- Token tidak dikenal: tidak ada baris sama sekali, bukan baris kosong.
  if v_log is null then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nama', u.nama, 'satuan', coalesce(u.satuan, ''), 'qty', u.qty)), '[]'::jsonb)
    into v_usage
    from material_usage u
   where u.user_id = v_user
     and (u.log_id = v_log
          or (v_proj <> '' and lower(trim(coalesce(u.project_name, ''))) = v_proj));

  select coalesce(jsonb_agg(jsonb_build_object(
           'nama', r.nama, 'satuan', coalesce(r.satuan, ''), 'qty', r.qty,
           'status', coalesce(r.status, ''))), '[]'::jsonb)
    into v_req
    from material_requests r
   where r.user_id = v_user
     and (r.log_id = v_log
          or (v_proj <> '' and lower(trim(coalesce(r.project_name, ''))) = v_proj));

  -- Delivery Order baru ada sejak migration_penerimaan.sql. Fungsi ini harus
  -- tetap bisa dipasang lebih dulu, jadi tabelnya diperiksa saat dijalankan.
  -- Tanpa nama proyek, DO tidak diambil sama sekali: menyaring hanya dengan
  -- user_id akan menarik penerimaan dari seluruh proyek perusahaan ke satu
  -- link publik.
  if v_proj <> '' and to_regclass('public.delivery_orders') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'nama',   it->>'nama',
               'satuan', coalesce(it->>'satuan', ''),
               -- Dibiarkan sebagai nilai JSON apa adanya; cast ke numeric di
               -- sini akan menggagalkan seluruh permintaan hanya karena satu
               -- item lama menyimpan qty sebagai teks.
               'qty',    coalesce(it->'qty', to_jsonb(0)))), '[]'::jsonb)
        from delivery_orders d
        join purchase_orders p on p.id = d.po_id
        cross join lateral jsonb_array_elements(coalesce(d.items, '[]'::jsonb)) it
       where d.user_id = $1
         and lower(trim(coalesce(p.project_name, ''))) = $2
    $q$ into v_do using v_user, v_proj;
  end if;

  return query select v_usage, v_req, coalesce(v_do, '[]'::jsonb);
end $$;

revoke all on function public.material_stok_by_report_token(text) from public;
grant execute on function public.material_stok_by_report_token(text) to anon, authenticated;
