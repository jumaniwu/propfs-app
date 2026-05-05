-- ============================================================
-- PROPFS: FULL SCHEMA RECONCILIATION & RLS FIX
-- ============================================================
-- Skrip ini memastikan SEMUA tabel yang dibutuhkan aplikasi
-- sudah terbuat (aman dijalankan meski tabel sudah ada karena
-- memakai IF NOT EXISTS), dan memperbaiki semua aturan keamanan
-- RLS agar tidak terkena infinite recursion.
-- ============================================================

-- 1. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name              TEXT,
  company                TEXT,
  phone                  TEXT,
  role                   TEXT NOT NULL DEFAULT 'user',
  total_projects_created INT  NOT NULL DEFAULT 0,
  custom_features        JSONB DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  price_idr    INT  NOT NULL DEFAULT 0,
  max_projects INT  NOT NULL DEFAULT 2,
  features     JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO subscription_plans (id, name, price_idr, max_projects, features) VALUES
  ('free',  'Free',  0,      2,  '{"export_pdf": false, "cashflow": false, "ar_ap": false, "templates": true, "project_slot_permanent": true}'),
  ('basic', 'Basic', 149000, 5,  '{"export_pdf": true,  "cashflow": false, "ar_ap": false, "templates": true, "project_slot_permanent": false}'),
  ('pro',   'Pro',   299000, 10, '{"export_pdf": true,  "cashflow": true,  "ar_ap": true,  "templates": true, "project_slot_permanent": false}')
ON CONFLICT (id) DO NOTHING;

-- 3. Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id             TEXT NOT NULL REFERENCES subscription_plans(id),
  status              TEXT NOT NULL DEFAULT 'active',
  started_at          TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  midtrans_order_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Payments
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  amount_idr      INT  NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  midtrans_tx_id  TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL,
  invoice_number  TEXT NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_end      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  subtotal_idr    INT NOT NULL DEFAULT 0,
  ppn_idr         INT NOT NULL DEFAULT 0,
  total_idr       INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  payment_method  TEXT,
  midtrans_order_id TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Projects
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Proyek Baru',
  inputs     JSONB NOT NULL DEFAULT '{}',
  results    JSONB,
  version    TEXT NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. App Settings
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES 
  ('subscription_enabled', 'false'),
  ('feature_flags', '{"fs_module":true,"cost_control":true,"cost_rab":true,"cost_material":false,"cost_realisasi":true,"ai_solver":true,"pdf_export":true,"scurve":true,"dashboard_admin":false}'),
  ('ppn_rate', '0.11'),
  ('landing_page_cms', '{"branding":{"logoUrl":"","siteName":"PropFS","tagline":"Feasibility Study & Cost Control System"},"hero":{"title":"Analisa Kelayakan Proyek Properti Lebih Cepat","subtitle":"Platform terintegrasi untuk menghitung cashflow, IRR, NPV hingga kontrol budget pembangunan dan Kurva S dalam satu dashboard.","hashtags":["#DeveloperProperti","#AnalisaKelayakan","#CostControl"],"imageUrl":""},"suitableFor":{"label":"SOLUSI TERBAIK UNTUK :","tags":["Developer Perumahan","Kontraktor","Investor Properti","Management Project"]},"features":[{"id":"1","title":"Feasibility Study","desc":"Analisa kelayakan finansial mendetail (IRR, NPV, ROI).","iconName":"Calculator"},{"id":"2","title":"Cost Control","desc":"Pelacakan budget RAB vs Realisasi proyek.","iconName":"BarChart"},{"id":"3","title":"Kurva S Otomatis","desc":"Visualisasi progres fisik dan finansial proyek.","iconName":"TrendingUp"},{"id":"4","title":"Laporan PDF","desc":"Ekspor laporan profesional siap cetak.","iconName":"FileText"}],"auxiliaryProducts":[{"id":"a1","title":"AI Profit Solver","desc":"Optimasi harga jual otomatis berbasis AI.","iconName":"Sparkles"},{"id":"a2","title":"Manajemen User","desc":"Akses hirarki untuk tim internal.","iconName":"Users"}],"marketingHighlight":{"title":"Digitalkan Analisa Properti Anda Secara Profesional","desc":"PropFS dirancang khusus untuk developer, kontraktor, dan investor properti Indonesia yang ingin bergerak lebih cepat dengan data yang akurat.","stats":[{"value":"10x","label":"Lebih Cepat Analisa"},{"value":"99%","label":"Akurasi Kalkulasi"},{"value":"500+","label":"Proyek Dibuat"}]}}')
ON CONFLICT (key) DO NOTHING;

-- ==========================================
-- ENABLE RLS ON ALL TABLES
-- ==========================================
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings          ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- SUPERADMIN HELPER FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT (role = 'superadmin') INTO is_admin 
  FROM public.profiles 
  WHERE id = auth.uid();
  RETURN coalesce(is_admin, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- RLS POLICIES REBUILD
-- ==========================================
-- Hapus semua policy yg mungkin error
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON ' || r.tablename;
  END LOOP;
END $$;

-- APP SETTINGS
CREATE POLICY "Anyone can read app_settings" ON app_settings FOR SELECT USING (true);
CREATE POLICY "Superadmin can insert app_settings" ON app_settings FOR INSERT WITH CHECK (is_superadmin());
CREATE POLICY "Superadmin can update app_settings" ON app_settings FOR UPDATE USING (is_superadmin());

-- SUBSCRIPTION PLANS
CREATE POLICY "Anyone can read plans" ON subscription_plans FOR SELECT USING (true);

-- PROFILES
CREATE POLICY "User can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "User can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "User can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Superadmin can read all profiles" ON profiles FOR SELECT USING (is_superadmin());
CREATE POLICY "Superadmin can update all profiles" ON profiles FOR UPDATE USING (is_superadmin());

-- PROJECTS
CREATE POLICY "User can select own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User can insert own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User can update own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "User can delete own projects" ON projects FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can read all projects" ON projects FOR SELECT USING (is_superadmin());

-- SUBSCRIPTIONS
CREATE POLICY "User can read own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User can insert own subscriptions" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User can update own subscriptions" ON subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can read all subscriptions" ON subscriptions FOR SELECT USING (is_superadmin());
CREATE POLICY "Superadmin can update all subscriptions" ON subscriptions FOR UPDATE USING (is_superadmin());

-- INVOICES
CREATE POLICY "Users can insert own invoices" ON invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own invoices" ON invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own invoices" ON invoices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can read all invoices" ON invoices FOR SELECT USING (is_superadmin());
CREATE POLICY "Superadmin can update all invoices" ON invoices FOR UPDATE USING (is_superadmin());

-- PAYMENTS
CREATE POLICY "User can read own payments" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User can insert own payments" ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User can update own payments" ON payments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can read all payments" ON payments FOR SELECT USING (is_superadmin());

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
