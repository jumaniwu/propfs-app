-- ============================================================
-- PROPFS: MIGRATION SQL - Jalankan ini di Supabase SQL Editor
-- Fixes: landing page CMS, feature flags, PPN, admin users RLS
-- ============================================================

-- 1. Seed missing app_settings rows (upsert safe)
INSERT INTO app_settings (key, value) VALUES
  ('feature_flags', '{"fs_module":true,"cost_control":true,"cost_rab":true,"cost_material":false,"cost_realisasi":true,"ai_solver":true,"pdf_export":true,"scurve":true,"dashboard_admin":false}'),
  ('ppn_rate', '0.11'),
  ('landing_page_cms', '{"branding":{"logoUrl":"","siteName":"PropFS","tagline":"Feasibility Study & Cost Control System"},"hero":{"title":"Analisa Kelayakan Proyek Properti Lebih Cepat","subtitle":"Platform terintegrasi untuk menghitung cashflow, IRR, NPV hingga kontrol budget pembangunan dan Kurva S dalam satu dashboard.","hashtags":["#DeveloperProperti","#AnalisaKelayakan","#CostControl"],"imageUrl":""},"suitableFor":{"label":"SOLUSI TERBAIK UNTUK :","tags":["Developer Perumahan","Kontraktor","Investor Properti","Management Project"]},"features":[{"id":"1","title":"Feasibility Study","desc":"Analisa kelayakan finansial mendetail (IRR, NPV, ROI).","iconName":"Calculator"},{"id":"2","title":"Cost Control","desc":"Pelacakan budget RAB vs Realisasi proyek.","iconName":"BarChart"},{"id":"3","title":"Kurva S Otomatis","desc":"Visualisasi progres fisik dan finansial proyek.","iconName":"TrendingUp"},{"id":"4","title":"Laporan PDF","desc":"Ekspor laporan profesional siap cetak.","iconName":"FileText"}],"auxiliaryProducts":[{"id":"a1","title":"AI Profit Solver","desc":"Optimasi harga jual otomatis berbasis AI.","iconName":"Sparkles"},{"id":"a2","title":"Manajemen User","desc":"Akses hirarki untuk tim internal.","iconName":"Users"}],"marketingHighlight":{"title":"Digitalkan Analisa Properti Anda Secara Profesional","desc":"PropFS dirancang khusus untuk developer, kontraktor, dan investor properti Indonesia yang ingin bergerak lebih cepat dengan data yang akurat.","stats":[{"value":"10x","label":"Lebih Cepat Analisa"},{"value":"99%","label":"Akurasi Kalkulasi"},{"value":"500+","label":"Proyek Dibuat"}]}}}')
ON CONFLICT (key) DO NOTHING;

-- 2. Add Superadmin can READ ALL profiles (for Admin Users panel)
-- Drop first if policy already exists to avoid error
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Superadmin can read all profiles'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can read all profiles"
        ON profiles FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = ''superadmin''
          )
        )
    ';
  END IF;
END$$;

-- 3. Add Superadmin can INSERT into subscriptions (used by PaymentPage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subscriptions' AND policyname = 'Superadmin or user can insert subscriptions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin or user can insert subscriptions"
        ON subscriptions FOR INSERT
        WITH CHECK (auth.uid() = user_id)
    ';
  END IF;
END$$;

-- 4. Add superadmin can update subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subscriptions' AND policyname = 'Superadmin can update subscriptions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Superadmin can update subscriptions"
        ON subscriptions FOR UPDATE
        USING (EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''superadmin''
        ))
    ';
  END IF;
END$$;

-- ✅ Done! Refresh the browser to apply all changes.
