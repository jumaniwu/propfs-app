-- ============================================================
-- PropFS — Periksa migrasi mana yang SUDAH dan BELUM dijalankan
--
-- Proyek ini tidak memakai tabel riwayat migrasi, jadi tidak ada catatan resmi
-- tentang apa yang sudah dijalankan. Selama ini status "sudah/belum" hanya
-- ingatan orang, dan ingatan itu bisa salah di kedua arah — mengira sudah
-- padahal belum (fiturnya diam-diam mati), atau mengira belum padahal sudah.
--
-- Berkas ini menjawabnya dari basis datanya sendiri: setiap migrasi diwakili
-- oleh SATU penanda khas — tabel, kolom, indeks, atau fungsi beserta bentuk
-- kembaliannya — yang hanya ada bila migrasi itu benar-benar dijalankan.
--
-- Cara pakai: tempel seluruh isi berkas ini ke Supabase SQL Editor, jalankan.
-- Hasilnya satu tabel. Yang perlu diperhatikan hanya baris berstatus BELUM.
--
-- Seluruh berkas ini SATU perintah, disengaja: SQL Editor hanya menampilkan
-- hasil perintah TERAKHIR, jadi kalau dipecah dua, tabel yang penting justru
-- tertelan oleh perintah di bawahnya.
--
-- Hanya MEMBACA. Tidak mengubah apa pun. Aman dijalankan kapan saja.
-- ============================================================

with penanda(urut, migrasi, keterangan, ada) as (values

  -- ── Dasar akun & langganan ───────────────────────────────────────────────
  (1, '20260423_invoices_payments.sql', 'tabel invoices & payments',
     to_regclass('public.invoices') is not null
     and to_regclass('public.payments') is not null),

  (2, 'migration_user_management.sql', 'kolom profiles.is_active',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_active')),

  (3, 'migration_free_trial.sql', 'fungsi check_expired_trials',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'check_expired_trials')),

  (4, 'migration_add_indexes.sql', 'indeks idx_invoices_user_id',
     exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_invoices_user_id')),

  (5, 'migration_invoices_rls.sql', 'kebijakan RLS invoices',
     exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices')),

  (6, 'migration_product_subscriptions.sql', 'kolom subscriptions.product',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'product')),

  (7, 'migration_addon_projects.sql', 'kolom profiles.addon_cost_slots',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'addon_cost_slots')),

  (8, 'migration_public_plan_catalog.sql', 'fungsi public_plan_catalog',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'public_plan_catalog')),

  (9, 'migration_affiliates.sql', 'tabel referral_earnings',
     to_regclass('public.referral_earnings') is not null),

  -- ── Perusahaan & tim ─────────────────────────────────────────────────────
  (10, 'migration_company_profile.sql', 'tabel company_profiles',
     to_regclass('public.company_profiles') is not null),

  (11, 'migration_team.sql', 'tabel team_members',
     to_regclass('public.team_members') is not null),

  (12, 'migration_team_login.sql', 'fungsi perusahaan_by_kode',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'perusahaan_by_kode')),

  (13, 'migration_team_quota.sql', 'fungsi kuota_tim_saya',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'kuota_tim_saya')),

  -- ── Kontraktor AI: proyek, SPK, lapangan ────────────────────────────────
  (14, 'migration_cost_projects_sync.sql', 'tabel cost_projects (sinkron antar-perangkat)',
     to_regclass('public.cost_projects') is not null),

  (15, 'migration_kontraktor_spk_opname.sql', 'tabel spk_docs & opname_forms',
     to_regclass('public.spk_docs') is not null
     and to_regclass('public.opname_forms') is not null),

  (16, 'migration_spk_pemberi_pasal.sql', 'spk_get_by_token memuat kolom pasal & lampiran',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'spk_get_by_token'
                and pg_get_function_result(p.oid) like '%lampiran_data%')),

  (17, 'migration_field_reports.sql', 'tabel field_reports & field_logs',
     to_regclass('public.field_reports') is not null
     and to_regclass('public.field_logs') is not null),

  (18, 'migration_material.sql', 'tabel material_requests & material_usage',
     to_regclass('public.material_requests') is not null
     and to_regclass('public.material_usage') is not null),

  (19, 'migration_token_pendek.sql', 'fungsi buat_token_pendek',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'buat_token_pendek')),

  -- ── Procurement & penerimaan barang ─────────────────────────────────────
  (20, 'migration_procurement.sql', 'tabel vendors, vendor_items & purchase_orders',
     to_regclass('public.vendors') is not null
     and to_regclass('public.vendor_items') is not null
     and to_regclass('public.purchase_orders') is not null),

  (21, 'migration_po_kop.sql', 'po_get_by_token memuat kop perusahaan',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'po_get_by_token'
                and pg_get_function_result(p.oid) like '%kop_nama%')),

  (22, 'migration_penerimaan.sql', 'tabel delivery_orders & po_payments',
     to_regclass('public.delivery_orders') is not null
     and to_regclass('public.po_payments') is not null),

  -- Tiga migrasi berikut menulis ulang fungsi yang SAMA
  -- (material_stok_by_report_token), berurutan. Yang terakhir menang, jadi
  -- yang perlu dipastikan hanya versi paling baru: bila stok_gudang sudah
  -- masuk, dua sebelumnya sudah tercakup seluruhnya.
  (23, 'migration_stok_lapangan.sql', 'fungsi material_stok_by_report_token ada',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'material_stok_by_report_token')),

  -- Penandanya isi FUNGSInya, bukan namanya: versi lama mencari DO hanya lewat
  -- kecocokan nama proyek, versi ini menelusuri rantai request_id.
  (24, 'migration_do_proyek.sql', 'material_stok_by_report_token menelusuri rantai request_id',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'material_stok_by_report_token'
                and p.prosrc like '%v_req_ids%')),

  (25, 'migration_stok_gudang.sql', 'material_stok_by_report_token memuat pembelian & penyesuaian',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'material_stok_by_report_token'
                and pg_get_function_result(p.oid) like '%penyesuaian%')),

  -- ── Yang ditambahkan dalam beberapa PR terakhir ─────────────────────────
  (26, 'migration_chat_tim.sql', 'tabel team_messages (Chat Tim)',
     to_regclass('public.team_messages') is not null),

  (27, 'migration_leads.sql', 'tabel leads (Cari Leads)',
     to_regclass('public.leads') is not null),

  (28, 'migration_leads_slug.sql', 'fungsi leads_token_set (custom shortlink)',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'leads_token_set')),

  (29, 'migration_kuota_manual.sql', 'kolom profiles.kuota_kontraktor',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'kuota_kontraktor')),

  -- ── Bukan migrasi, melainkan akibatnya ──────────────────────────────────
  -- PO tanpa nama proyek itu yatim: surat jalannya ada, barangnya datang,
  -- tetapi tidak ada yang tahu barang itu milik proyek mana. Bila baris ini
  -- BELUM, jalankan ulang bagian pemulihan di migration_do_proyek.sql —
  -- aman diulang.
  --
  -- `query_to_xml` dipakai karena kueri terhadap tabel yang belum ada gagal
  -- saat DIURAI, bukan saat dijalankan; `to_regclass(...) is null or ...`
  -- tetap meledak. Dengan query_to_xml, kuerinya baru diurai saat dijalankan.
  -- ── Yang belum pernah masuk daftar ini ──────────────────────────────────
  --
  -- Sembilan migrasi di bawah sudah ada di folder tetapi tidak pernah
  -- didaftarkan di sini, jadi tidak ada satu pun cara memeriksa apakah ia
  -- sudah dijalankan — selain menunggu fiturnya gagal. Beberapa keluhan
  -- "kok datanya tidak tersimpan" ternyata memang begitu sebabnya.

  (31, 'migration_aset_alat.sql', 'tabel aset_alat (Aset & Alat Kerja)',
     to_regclass('public.aset_alat') is not null),

  (32, 'migration_absensi_pekerja.sql', 'kolom field_reports.absensi',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'field_reports'
                and column_name = 'absensi')),

  (33, 'migration_pekerja_lapangan.sql', 'tabel pekerja_lapangan (daftar tukang & upah)',
     to_regclass('public.pekerja_lapangan') is not null),

  (34, 'migration_po_revisi_pengiriman.sql', 'kolom purchase_orders.kirim_alamat',
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'purchase_orders'
                and column_name = 'kirim_alamat')),

  (35, 'migration_po_satuan_penuhi.sql', 'po_tandai_terkirim memakai kolom penuhi',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'po_tandai_terkirim'
                and p.prosrc like '%penuhi%')),

  (36, 'migration_gambar_kerja.sql', 'tabel gambar_kerja (Gambar Kerja & Denah)',
     to_regclass('public.gambar_kerja') is not null),

  (37, 'migration_aset_pinjam.sql', 'tabel aset_pinjam (serah-terima alat)',
     to_regclass('public.aset_pinjam') is not null),

  -- Penandanya ISI fungsinya, bukan namanya: fungsinya sudah lama ada, yang
  -- berubah adalah absensi tidak lagi ikut terkirim ke halaman owner.
  (38, 'migration_owner_tanpa_absensi.sql', 'field_log_by_view_token membuang kolom absensi',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'field_log_by_view_token'
                and p.prosrc like '%''absensi''%')),

  -- Sama: yang berubah tipe kembaliannya, bukan namanya.
  (39, 'migration_po_token_alamat.sql', 'po_get_by_token mengirim alamat pengiriman',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'po_get_by_token'
                and pg_get_function_result(p.oid) like '%kirim_alamat%')),

  (40, 'migration_gabung_buku.sql', 'field_log_gabung menyatukan buku laporan kembar',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'field_log_gabung')),

  -- Buku laporan kembar itu keadaan DATA, bukan migrasi. Ia bisa muncul lagi
  -- kapan saja, dan itu bukan tanda migrasinya hilang — itu tanda ada proyek
  -- yang perlu digabungkan lewat panel di tab Laporan Lapangan.
  (41, 'migration_upah_pekerja.sql', 'field_worker_upah memperbaiki upah tanpa mendaftar ulang',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'field_worker_upah')),

  -- Migrasi ini tidak membuat objek baru; ia MEMPERBAIKI DATA. Penandanya
  -- karena itu keadaan datanya sendiri: tidak ada lagi buku laporan yang
  -- tersimpan atas nama anggota tim, bukan atas nama perusahaannya.
  (32, '(data) Buku laporan milik perusahaan', 'tidak ada buku yang tersimpan atas nama anggota tim',
     coalesce((
       select (xpath('/row/c/text()', query_to_xml(
         $q$ select count(*) as c from public.field_logs l
              where exists (select 1 from public.team_members t
                             where t.member_user_id = l.user_id and t.status = 'aktif') $q$,
         false, true, '')))[1]::text::int
       where to_regclass('public.field_logs') is not null
         and to_regclass('public.team_members') is not null
     ), 0) = 0),

  (31, '(data) Buku laporan kembar', 'tiap proyek hanya punya satu buku laporan',
     coalesce((
       select (xpath('/row/c/text()', query_to_xml(
         $q$ select count(*) as c from (
               select user_id, lower(btrim(project_name)) as nama
                 from public.field_logs
                where coalesce(btrim(project_name), '') <> ''
                group by 1, 2 having count(*) > 1) x $q$, false, true, '')))[1]::text::int
       where to_regclass('public.field_logs') is not null
     ), 0) = 0),

  (30, '(data) PO tanpa nama proyek', 'tidak ada PO yang kehilangan nama proyek',
     coalesce((
       select (xpath('/row/c/text()', query_to_xml(
         $q$ select count(*) as c from public.purchase_orders
              where coalesce(trim(project_name), '') = '' $q$, false, true, '')))[1]::text::int
       where to_regclass('public.purchase_orders') is not null
     ), 0) = 0)
)

select
  case when ada then '✅ SUDAH' else '❌ BELUM' end as status,
  migrasi,
  keterangan as penanda_yang_diperiksa
from penanda
order by ada, urut;

-- ============================================================
-- CATATAN tentang dua baris yang bisa menyesatkan:
--
-- • migration_do_proyek.sql tidak menciptakan objek baru apa pun — ia
--   MEMPERBAIKI DATA dan menulis ulang sebuah fungsi. Penandanya karena itu
--   isi badan fungsinya, dan akibat datanya diperiksa terpisah pada baris
--   "(data) PO tanpa nama proyek". Baris data itu bisa kembali BELUM kapan
--   saja bila ada PO baru dibuat tanpa proyek aktif — dan itu memang benar,
--   bukan tanda migrasinya hilang.
--
-- • "(data) Buku laporan kembar" juga keadaan data, bukan migrasi. ❌ di
--   sana berarti ada proyek yang punya lebih dari satu buku laporan — isinya
--   terpecah dan rekap absensinya hanya membaca satu buku. Perbaikannya bukan
--   menghapus salah satunya (itu menghanguskan isinya), melainkan panel
--   "Gabungkan jadi 1 buku" di tab Laporan Lapangan.
--
-- • "(data) Buku laporan milik perusahaan" juga keadaan data. ❌ berarti ada
--   buku laporan yang tersimpan atas nama pengawas/PM, bukan atas nama
--   perusahaannya — dan buku seperti itu TIDAK terlihat oleh pemilik akun,
--   karena is_team_member hanya berlaku satu arah. Perbaikannya:
--   migration_buku_milik_perusahaan.sql.
--
-- • migration_stok_lapangan.sql hanya memastikan fungsinya ADA. Bila baris
--   stok_gudang sudah ✅, versi yang berlaku adalah yang terbaru dan baris
--   ini tidak perlu diperhatikan lagi.
-- ============================================================
