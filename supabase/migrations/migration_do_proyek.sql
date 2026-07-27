-- ============================================================
-- PropFS — Penerimaan barang (DO) menemukan proyeknya sendiri
--
-- Stok dari surat jalan tidak pernah muncul karena penghubung ke proyek hanya
-- satu: `purchase_orders.project_name`. Kolom itu diisi dari proyek yang
-- sedang aktif di aplikasi saat PO dibuat, dan kalau Procurement dibuka
-- langsung dari Home tanpa memuat proyek, isinya KOSONG. PO seperti itu
-- yatim: surat jalannya ada, barangnya datang, tetapi tidak ada yang tahu
-- barang itu milik proyek mana.
--
-- Nama proyek juga teks bebas. Menggantungkan seluruh alur pada kecocokan
-- teks membuat satu salah ketik memutus rantainya diam-diam.
--
-- Berkas ini memperbaiki dua-duanya:
--   1. Mengisi ulang project_name PO yang kosong, ditelusuri dari Material
--      Request asal barangnya — data yang memang sudah ada di PO-nya.
--   2. Mengajari halaman laporan publik mencari DO lewat rantai
--      request_id, bukan hanya lewat kecocokan nama proyek. Rantai itu
--      berupa id, bukan teks, jadi tidak bisa putus karena beda penulisan.
--
-- Jalankan di Supabase SQL Editor SETELAH migration_stok_lapangan.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

-- ── 1. Pulihkan project_name PO yang telanjur kosong ────────────────────────
-- Hanya menyentuh baris yang memang kosong; PO yang sudah benar tidak diubah.
do $do$
begin
  if to_regclass('public.purchase_orders') is null
     or to_regclass('public.material_requests') is null then
    return;
  end if;

  update public.purchase_orders p
     set project_name = sub.nama
    from (
      select p2.id,
             (select r.project_name
                from jsonb_array_elements(coalesce(p2.items, '[]'::jsonb)) i
                join public.material_requests r on r.id::text = i->>'request_id'
               where coalesce(trim(r.project_name), '') <> ''
               limit 1) as nama
        from public.purchase_orders p2
       where coalesce(trim(p2.project_name), '') = ''
    ) sub
   where p.id = sub.id
     and coalesce(sub.nama, '') <> '';
end
$do$;

-- ── 2. Halaman laporan publik: cari DO lewat request, bukan hanya nama ──────
create or replace function public.material_stok_by_report_token(p_token text)
returns table (usage jsonb, requests jsonb, penerimaan jsonb)
language plpgsql security definer stable set search_path = public as $$
declare
  v_log     uuid;
  v_user    uuid;
  v_proj    text;
  v_req_ids text[] := '{}';
  v_usage   jsonb := '[]'::jsonb;
  v_req     jsonb := '[]'::jsonb;
  v_do      jsonb := '[]'::jsonb;
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

  -- Request dalam lingkup ini dipakai dua kali: sebagai data stok, dan
  -- sebagai kunci untuk menemukan surat jalan yang lahir dari request itu.
  select coalesce(jsonb_agg(jsonb_build_object(
           'nama', r.nama, 'satuan', coalesce(r.satuan, ''), 'qty', r.qty,
           'status', coalesce(r.status, ''))), '[]'::jsonb),
         coalesce(array_agg(r.id::text), '{}')
    into v_req, v_req_ids
    from material_requests r
   where r.user_id = v_user
     and (r.log_id = v_log
          or (v_proj <> '' and lower(trim(coalesce(r.project_name, ''))) = v_proj));

  -- Delivery Order baru ada sejak migration_penerimaan.sql. Fungsi ini harus
  -- tetap bisa dipasang lebih dulu, jadi tabelnya diperiksa saat dijalankan.
  -- Tanpa satu pun pengait — nama proyek maupun request — DO tidak diambil:
  -- menyaring hanya dengan user_id akan menarik penerimaan seluruh proyek
  -- perusahaan ke satu link publik.
  if to_regclass('public.delivery_orders') is not null
     and (v_proj <> '' or array_length(v_req_ids, 1) > 0) then
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
         and (
           ($2 <> '' and lower(trim(coalesce(p.project_name, ''))) = $2)
           -- Jalur cadangan: PO yang nama proyeknya kosong atau beda
           -- penulisan tetap terhubung lewat request asal barangnya.
           or exists (
             select 1 from jsonb_array_elements(coalesce(p.items, '[]'::jsonb)) pi
              where pi->>'request_id' = any($3)
           )
         )
    $q$ into v_do using v_user, v_proj, v_req_ids;
  end if;

  return query select v_usage, v_req, coalesce(v_do, '[]'::jsonb);
end $$;

revoke all on function public.material_stok_by_report_token(text) from public;
grant execute on function public.material_stok_by_report_token(text) to anon, authenticated;
