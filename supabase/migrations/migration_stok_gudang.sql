-- ============================================================
-- PropFS — Stok lapangan ikut membaca gudang di Akuntan
--
-- Halaman tukang hanya mengenal tiga sumber: request material, pemakaian, dan
-- surat jalan. Padahal Inventori di Akuntan punya dua sumber lagi yang tidak
-- pernah sampai ke lapangan:
--
--   1. Pembelian material dari nota di Realisasi Biaya — termasuk yang
--      dimasukkan lewat chat AI. Barang yang dibeli langsung di toko tanpa PO
--      tidak pernah punya surat jalan, jadi di halaman tukang selamanya
--      tertulis "penerimaan belum tercatat".
--   2. Penyesuaian stok manual (koreksi, opname, temuan gudang).
--
-- PO dan surat jalan TIDAK disyaratkan. Keduanya hanya salah satu jalan masuk;
-- gudang di Akuntan berdiri sendiri dan dibaca apa adanya.
--
-- Akibatnya dua layar menyebut barang yang sama dengan angka berbeda, dan
-- yang di lapangan justru yang paling tidak lengkap — padahal merekalah yang
-- perlu tahu sisanya sebelum memakai.
--
-- Keduanya tersimpan sebagai JSON pada `cost_projects` dan `akuntan_data`.
-- Fungsi ini membacanya dan mengembalikan HANYA nama, satuan, dan qty — harga,
-- supplier, nomor nota, dan seluruh isi keuangan lainnya tidak ikut, karena
-- halaman ini publik.
--
-- Jalankan di Supabase SQL Editor SETELAH migration_do_proyek.sql.
-- Aman dijalankan berulang kali.
-- ============================================================

-- Bentuk hasilnya bertambah dua kolom, dan Postgres menolak `create or replace`
-- yang mengubah daftar kolom (ERROR 42P13). Fungsi lama dibuang dulu.
drop function if exists public.material_stok_by_report_token(text);

create or replace function public.material_stok_by_report_token(p_token text)
returns table (
  usage jsonb, requests jsonb, penerimaan jsonb,
  pembelian jsonb, penyesuaian jsonb
)
language plpgsql security definer stable set search_path = public as $$
declare
  v_log      uuid;
  v_user     uuid;
  v_proj     text;
  v_req_ids  text[] := '{}';
  v_proj_ids text[] := '{}';
  v_usage    jsonb := '[]'::jsonb;
  v_req      jsonb := '[]'::jsonb;
  v_do       jsonb := '[]'::jsonb;
  v_beli     jsonb := '[]'::jsonb;
  v_sesuai   jsonb := '[]'::jsonb;
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

  -- Delivery Order baru ada sejak migration_penerimaan.sql, jadi tabelnya
  -- diperiksa saat dijalankan. Tanpa satu pun pengait — nama proyek maupun
  -- request — DO tidak diambil: menyaring hanya dengan user_id akan menarik
  -- penerimaan seluruh proyek perusahaan ke satu link publik.
  if to_regclass('public.delivery_orders') is not null
     and (v_proj <> '' or array_length(v_req_ids, 1) > 0) then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'nama',   it->>'nama',
               'satuan', coalesce(it->>'satuan', ''),
               'qty',    coalesce(it->'qty', to_jsonb(0)))), '[]'::jsonb)
        from delivery_orders d
        join purchase_orders p on p.id = d.po_id
        cross join lateral jsonb_array_elements(coalesce(d.items, '[]'::jsonb)) it
       where d.user_id = $1
         and (
           ($2 <> '' and lower(trim(coalesce(p.project_name, ''))) = $2)
           or exists (
             select 1 from jsonb_array_elements(coalesce(p.items, '[]'::jsonb)) pi
              where pi->>'request_id' = any($3)
           )
         )
    $q$ into v_do using v_user, v_proj, v_req_ids;
  end if;

  -- ── Gudang di Akuntan ────────────────────────────────────────────────────
  -- Proyek dikenali lewat NAMA (dari field_logs) sedangkan penyesuaian stok
  -- menyimpan ID proyek, jadi id-nya dicari dulu lewat nama.
  --
  -- Bila link laporannya TIDAK punya nama proyek, penyaringnya dilonggarkan ke
  -- seluruh gudang milik pemilik link. Itu disengaja: link tanpa nama proyek
  -- tidak punya alat lain untuk mengenali proyeknya, dan menampilkan daftar
  -- kosong membuat fiturnya seolah rusak. Batas yang tetap dijaga adalah
  -- pemiliknya — gudang perusahaan lain tidak pernah ikut.
  if to_regclass('public.cost_projects') is not null then
    execute $q$
      select coalesce(array_agg(c.data->'info'->>'id'), '{}')
        from cost_projects c
       where c.user_id = $1
         and ($2 = '' or lower(trim(coalesce(c.data->'info'->>'projectName', ''))) = $2)
    $q$ into v_proj_ids using v_user, v_proj;

    -- Pembelian material dari nota — termasuk yang dimasukkan lewat chat AI
    -- tanpa PO sama sekali. Surat jalan maupun PO TIDAK disyaratkan di sini;
    -- inilah satu-satunya jalan bagi barang yang dibeli langsung di toko.
    --
    -- Entri yang sudah menjadi surat jalan (`doId`) dilewati — barangnya sudah
    -- terhitung lewat DO di atas, dan menghitung keduanya berarti satu kiriman
    -- masuk gudang dua kali.
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'nama',   coalesce(nullif(trim(e->>'namaMaterial'), ''), trim(e->>'keterangan')),
               'satuan', coalesce(e->>'satuan', ''),
               'qty',    coalesce(e->'volume', to_jsonb(0)))), '[]'::jsonb)
        from cost_projects c
        cross join lateral jsonb_array_elements(coalesce(c.data->'realisasiEntries', '[]'::jsonb)) e
       where c.user_id = $1
         and ($2 = '' or lower(trim(coalesce(c.data->'info'->>'projectName', ''))) = $2)
         and e->>'tipe' = 'material'
         and coalesce(e->>'doId', '') = ''
         and coalesce(nullif(trim(e->>'namaMaterial'), ''), trim(e->>'keterangan')) <> ''
    $q$ into v_beli using v_user, v_proj;
  end if;

  -- Penyesuaian manual. Qty bertanda: positif menambah, negatif mengurangi.
  -- Penyesuaian lama bisa saja tidak punya projectId sama sekali; yang seperti
  -- itu ikut terbawa, karena membuangnya berarti stok yang sudah dikoreksi
  -- manusia justru hilang dari lapangan.
  if to_regclass('public.akuntan_data') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'nama',   trim(a->>'nama'),
               'satuan', coalesce(a->>'satuan', ''),
               'qty',    coalesce(a->'qty', to_jsonb(0)))), '[]'::jsonb)
        from akuntan_data d
        cross join lateral jsonb_array_elements(coalesce(d.data->'inventoryAdjustments', '[]'::jsonb)) a
       where d.user_id = $1
         and ($3 = '' or coalesce(a->>'projectId', '') = '' or coalesce(a->>'projectId', '') = any($2))
         and trim(coalesce(a->>'nama', '')) <> ''
    $q$ into v_sesuai using v_user, v_proj_ids, v_proj;
  end if;

  return query select
    v_usage, v_req,
    coalesce(v_do, '[]'::jsonb),
    coalesce(v_beli, '[]'::jsonb),
    coalesce(v_sesuai, '[]'::jsonb);
end $$;

revoke all on function public.material_stok_by_report_token(text) from public;
grant execute on function public.material_stok_by_report_token(text) to anon, authenticated;
