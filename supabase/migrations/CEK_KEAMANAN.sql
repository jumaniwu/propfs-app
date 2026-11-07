-- ============================================================
-- PropFS — Mencari JEJAK pembobolan di data
--
-- HANYA MEMBACA. Tidak ada satu baris pun yang diubah atau dihapus.
-- Tempel di Supabase → SQL Editor → Run. Hasilnya satu tabel.
--
-- KENAPA BERKAS INI ADA.
--
-- Pemeriksaan rutin atas data yang menentukan hak akses dan pembayaran:
-- siapa yang memegang role admin, langganan yang aktif tanpa pembayaran,
-- invoice yang nilainya tidak wajar, masa coba dan fitur yang terbuka di
-- luar kebiasaan. Hal-hal seperti ini tidak terlihat di log server sebagai
-- sesuatu yang aneh, tetapi meninggalkan jejak di datanya.
--
-- CARA MEMBACA HASILNYA.
--
-- Baris bertanda ✅ — tidak ada jejak sama sekali.
-- Baris bertanda ⚠️ — ADA yang perlu dilihat. Itu BELUM berarti dibobol:
--   langganan yang Anda berikan manual dari panel admin, misalnya, juga
--   tidak punya invoice lunas. Cocokkan nama-nama di kolom rincian dengan
--   yang Anda ingat pernah Anda berikan sendiri. Yang tidak Anda kenali,
--   itulah yang patut dicurigai.
--
-- YANG TIDAK BISA DIPERIKSA DARI SINI.
--
-- Siapa yang pernah MEMBACA data tidak meninggalkan jejak di tabel apa pun.
-- Pembacaan email_logs tanpa login, misalnya, hanya terlihat di log API
-- Supabase (Dashboard → Logs → API), dan hanya sejauh masa simpan log itu.
-- ============================================================

with
-- 1. Siapa saja yang memegang kunci induk.
admin as (
  select 1 as urut,
         'Akun ber-role admin / superadmin' as pemeriksaan,
         count(*) as jumlah,
         string_agg(coalesce(to_jsonb(p) ->> 'email', p.id::text) || ' (' || p.role || ')', '; ') as rincian,
         'Semua nama ini HARUS Anda kenali. Nama asing berarti ada yang menaikkan dirinya sendiri — ' ||
         'turunkan role-nya ke user, lalu periksa apa yang sempat ia ubah.' as tindakan
    from profiles p
   where p.role in ('admin', 'superadmin')
),

-- 2. Langganan berbayar yang aktif tanpa satu pun invoice lunas.
langganan as (
  select 2,
         'Langganan berbayar aktif tanpa invoice lunas',
         count(*),
         string_agg(coalesce(to_jsonb(pr) ->> 'email', s.user_id::text) || ' → ' || s.plan_id, '; '),
         'Bisa sah (Anda berikan manual dari panel admin) atau dibuat sendiri lewat celah. ' ||
         'Yang tidak pernah Anda berikan sendiri, nonaktifkan.'
    from subscriptions s
    left join profiles pr on pr.id = s.user_id
   where s.status = 'active'
     and s.plan_id <> 'free'
     and not exists (select 1 from invoices i where i.user_id = s.user_id and i.status = 'paid')
),

-- 3. Invoice lunas yang nilainya di bawah harga SEBULAN paketnya.
--    Diskon 3/12 bulan & PPN justru membuat totalnya lebih besar dari harga
--    sebulan, jadi di bawah itu tidak punya penjelasan yang wajar.
murah as (
  select 3,
         'Invoice lunas di bawah harga sebulan paketnya',
         count(*),
         string_agg(i.invoice_number || ' (' || i.plan_id || ': dibayar Rp ' || i.total_idr ||
                    ', harga Rp ' || sp.price_idr || ')', '; '),
         'Cocokkan dengan transaksi di dashboard Midtrans. Pembayaran yang jauh di bawah harga ' ||
         'paket adalah tanda harga diubah sebelum dibayar.'
    from invoices i
    join subscription_plans sp on sp.id = i.plan_id
   where i.status = 'paid'
     and sp.price_idr > 0
     and i.total_idr < sp.price_idr
),

-- 4. Invoice lunas dengan nilai yang tidak masuk akal untuk apa pun.
receh as (
  select 4,
         'Invoice lunas di bawah Rp 10.000',
         count(*),
         string_agg(i.invoice_number || ' (' || i.plan_id || ', Rp ' || i.total_idr || ')', '; '),
         'Tidak ada produk PropFS seharga ini. Periksa di Midtrans berapa yang benar-benar dibayar.'
    from invoices i
   where i.status = 'paid' and coalesce(i.total_idr, 0) < 10000
),

-- 5. Masa coba yang terlalu jauh ke depan.
trial as (
  select 5,
         'Masa coba berakhir lebih dari 60 hari lagi',
         count(*),
         string_agg(coalesce(to_jsonb(p) ->> 'email', p.id::text) || ' (s.d. ' ||
                    left(to_jsonb(p) ->> 'trial_expires_at', 10) || ')', '; '),
         'Masa coba normal jauh lebih pendek. Yang tidak pernah Anda perpanjang sendiri, kembalikan.'
    from profiles p
   where (to_jsonb(p) ->> 'trial_expires_at') is not null
     and (to_jsonb(p) ->> 'trial_expires_at')::timestamptz > now() + interval '60 days'
),

-- 6. Fitur berbayar yang dibuka khusus untuk pengguna biasa.
fitur as (
  select 6,
         'Pengguna biasa dengan fitur khusus terbuka',
         count(*),
         string_agg(coalesce(to_jsonb(p) ->> 'email', p.id::text), '; '),
         'custom_features hanya boleh diisi superadmin. Yang tidak Anda isi sendiri, kosongkan.'
    from profiles p
   where p.role = 'user'
     and (to_jsonb(p) -> 'custom_features') is not null
     and jsonb_typeof(to_jsonb(p) -> 'custom_features') = 'object'
     and (to_jsonb(p) -> 'custom_features') <> '{}'::jsonb
),

-- 7. Slot tambahan tanpa satu pun pembelian add-on yang lunas.
slot as (
  select 7,
         'Slot add-on tanpa pembelian add-on yang lunas',
         count(*),
         string_agg(coalesce(to_jsonb(p) ->> 'email', p.id::text), '; '),
         'Slot hanya ditambah webhook pembayaran. Tanpa invoice add-on lunas, asalnya patut ditanyakan.'
    from profiles p
   where (coalesce((to_jsonb(p) ->> 'addon_fs_slots')::int, 0)
        + coalesce((to_jsonb(p) ->> 'addon_cost_slots')::int, 0)
        + coalesce((to_jsonb(p) ->> 'addon_user_slots')::int, 0)) > 0
     and not exists (select 1 from invoices i
                      where i.user_id = p.id and i.status = 'paid' and i.plan_id like 'addon%')
),

-- 8. Sudah membayar, tetapi paketnya tidak aktif.
--    Kebalikan baris 2: bukan celah, melainkan pelanggan yang dirugikan.
--    Invoice paket yang lunas dan periodenya belum habis, sementara
--    pemiliknya tidak punya langganan berbayar yang masih berjalan.
belum_aktif as (
  select 8,
         'Sudah bayar, tetapi paketnya tidak aktif',
         count(*),
         string_agg(i.invoice_number || ' — ' || coalesce(to_jsonb(pr) ->> 'email', i.user_id::text) ||
                    ' (' || i.plan_id || ', s.d. ' || left(to_jsonb(i) ->> 'period_end', 10) || ')', '; '),
         'Pelanggan ini membayar tetapi tidak menerima paketnya. Aktifkan dari panel admin ' ||
         'sampai tanggal akhir periode invoice-nya.'
    from invoices i
    left join profiles pr on pr.id = i.user_id
   where i.status = 'paid'
     and i.plan_id not like 'addon%'
     and i.plan_id <> 'free'
     and (to_jsonb(i) ->> 'period_end') is not null
     and (to_jsonb(i) ->> 'period_end')::timestamptz > now()
     and not exists (
           select 1 from subscriptions s
            where s.user_id = i.user_id
              and s.status = 'active'
              and s.plan_id <> 'free'
              and coalesce(to_jsonb(s) ->> 'expired_at', to_jsonb(s) ->> 'expires_at') is not null
              and coalesce(to_jsonb(s) ->> 'expired_at', to_jsonb(s) ->> 'expires_at')::timestamptz > now())
),

-- 9. Pembayaran yang ditahan sistem untuk ditinjau.
tinjau as (
  select 9,
         'Pembayaran yang menunggu tinjauan',
         count(*),
         string_agg(i.invoice_number || ': ' ||
                    left(regexp_replace(to_jsonb(i) ->> 'notes', '\s+', ' ', 'g'), 200), '; '),
         'Uangnya sudah masuk tetapi paket tidak diaktifkan otomatis (nilai kurang, paket tidak ' ||
         'dikenal, atau aktivasi gagal). Cocokkan dengan Midtrans lalu putuskan dari panel admin.'
    from invoices i
   where (to_jsonb(i) ->> 'notes') like '%PERLU DITINJAU%'
      or (to_jsonb(i) ->> 'notes') like '%AKTIVASI GAGAL%'
),

-- 10. & 11. Apakah penutup celah sudah terpasang.
penutup as (
  select 10,
         'Penjaga kolom profil (migration_kunci_keamanan.sql)',
         case when exists (select 1 from pg_trigger
                            where tgname = 'trg_lindungi_kolom_profil' and not tgisinternal)
              then 0 else 1 end,
         case when exists (select 1 from pg_trigger
                            where tgname = 'trg_lindungi_kolom_profil' and not tgisinternal)
              then 'terpasang' else 'BELUM TERPASANG — celah role masih terbuka' end,
         'Jalankan migration_kunci_keamanan.sql bila belum.'
),

penutup_bayar as (
  select 11,
         'Penjaga langganan & invoice (migration_kunci_pembayaran.sql)',
         case when exists (select 1 from pg_trigger
                            where tgname = 'trg_lindungi_langganan' and not tgisinternal)
               and exists (select 1 from pg_trigger
                            where tgname = 'trg_lindungi_invoice' and not tgisinternal)
              then 0 else 1 end,
         case when exists (select 1 from pg_trigger
                            where tgname = 'trg_lindungi_langganan' and not tgisinternal)
               and exists (select 1 from pg_trigger
                            where tgname = 'trg_lindungi_invoice' and not tgisinternal)
              then 'terpasang' else 'belum terpasang' end,
         'Jalankan migration_kunci_pembayaran.sql HANYA SESUDAH versi aplikasi terbaru ter-deploy ' ||
         'dan satu pembayaran percobaan berhasil mengaktifkan paketnya.'
)

-- Daftar admin SELALU berisi minimal pemilik akun, jadi bukan alarm: ia
-- ditandai ℹ️ untuk diperiksa namanya satu per satu.
select case when urut = 1 then 'ℹ️'
            when jumlah = 0 then '✅' else '⚠️' end as status,
       pemeriksaan,
       jumlah,
       coalesce(rincian, '-') as rincian,
       case when jumlah = 0 and urut <> 1 then '-' else tindakan end as tindakan
  from (
    select * from admin union all select * from langganan union all select * from murah
    union all select * from receh union all select * from trial union all select * from fitur
    union all select * from slot union all select * from belum_aktif union all select * from tinjau
    union all select * from penutup union all select * from penutup_bayar
  ) semua
 order by urut;
