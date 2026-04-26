-- ============================================================
-- PropFS — Supabase Database Schema
-- Jalankan SQL ini di Supabase → SQL Editor
-- ============================================================

-- 1. Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name              TEXT,
  company                TEXT,
  phone                  TEXT,
  role                   TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin' | 'superadmin'
  total_projects_created INT  NOT NULL DEFAULT 0,        -- TIDAK berkurang saat delete (Free plan)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile saat user register
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company, role, total_projects_created)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'company',
    'user',
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id           TEXT PRIMARY KEY,  -- 'free' | 'basic' | 'pro'
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
  status              TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'expired' | 'cancelled'
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
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'failed'
  midtrans_tx_id  TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Projects (migrasi dari localStorage)
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

-- 6. App Settings (Feature Flags)
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature flag: subscription OFF by default
INSERT INTO app_settings (key, value)
VALUES ('subscription_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ── Row Level Security ─────────────────────────────────────

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings          ENABLE ROW LEVEL SECURITY;

-- profiles: user bisa baca/edit milik sendiri
CREATE POLICY "User can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "User can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "User can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- subscriptions: user bisa baca milik sendiri
CREATE POLICY "User can read own subscriptions"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- payments: user bisa baca milik sendiri
CREATE POLICY "User can read own payments"
  ON payments FOR SELECT USING (auth.uid() = user_id);

-- projects: user bisa CRUD milik sendiri
CREATE POLICY "User can CRUD own projects"
  ON projects FOR ALL USING (auth.uid() = user_id);

-- subscription_plans: semua bisa baca
CREATE POLICY "Anyone can read plans"
  ON subscription_plans FOR SELECT USING (true);

-- app_settings: semua bisa baca (anon + auth)
CREATE POLICY "Anyone can read app_settings"
  ON app_settings FOR SELECT USING (true);

-- app_settings: superadmin update
CREATE POLICY "Superadmin can update app_settings"
  ON app_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- ── Helper RPC functions ───────────────────────────────────

-- Increment total_projects_created (cannot go below 0)
CREATE OR REPLACE FUNCTION increment_project_counter(uid UUID)
RETURNS void AS $$
  UPDATE profiles
  SET total_projects_created = total_projects_created + 1
  WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Set total_projects_created to at least min_count (for migration)
CREATE OR REPLACE FUNCTION set_min_project_counter(uid UUID, min_count INT)
RETURNS void AS $$
  UPDATE profiles
  SET total_projects_created = GREATEST(total_projects_created, min_count)
  WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Superadmin: ganti role manual ──────────────────────────
-- Setelah user daftar, jalankan ini untuk set sebagai superadmin:
-- UPDATE profiles SET role = 'superadmin' WHERE id = '<user-uuid>';

