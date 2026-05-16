-- ============================================================
-- PropFS — Database Index Optimization
-- Jalankan skrip ini di SQL Editor Supabase untuk mempercepat loading
-- ============================================================

-- 1. Optimasi tabel projects (Feasibility Study)
-- Mempercepat filter per user dan pengurutan terbaru
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- 2. Optimasi tabel invoices
-- Mempercepat tampilan riwayat pembayaran user
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- 3. Optimasi tabel subscriptions
-- Mempercepat pengecekan status langganan saat login
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expired_at ON subscriptions(expired_at);

-- 5. Optimasi tabel profiles
-- Walaupun ID biasanya sudah ter-index PK, index pada email sering berguna untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

ANALYZE projects;
ANALYZE invoices;
ANALYZE subscriptions;
ANALYZE profiles;
