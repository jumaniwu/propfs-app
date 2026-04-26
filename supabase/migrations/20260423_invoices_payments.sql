-- ============================================================
-- PropFS — Database Schema for Invoices, Payments & Email Logs
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Invoices: Dokumen tagihan per transaksi langganan
CREATE TABLE IF NOT EXISTS invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        text UNIQUE NOT NULL,    -- 'INV-2026-04-0001'
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id               text NOT NULL,           -- 'starter' | 'pro' | 'enterprise'
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  subtotal_idr          int NOT NULL,
  ppn_idr               int NOT NULL DEFAULT 0,  -- 11% dari subtotal
  total_idr             int NOT NULL,
  status                text NOT NULL DEFAULT 'pending', -- 'pending'|'paid'|'failed'|'cancelled'
  payment_method        text,                    -- 'bank_transfer'|'qris'|'gopay'|'credit_card'
  midtrans_order_id     text,
  midtrans_transaction_id text,
  notes                 text,
  paid_at               timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- 2. Payments: Raw log dari Midtrans webhook
CREATE TABLE IF NOT EXISTS payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            uuid REFERENCES invoices(id) ON DELETE SET NULL,
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_idr            int NOT NULL,
  status                text NOT NULL,           -- 'settlement'|'pending'|'deny'|'expire'
  payment_type          text,                    -- 'bank_transfer'|'qris'|'gopay'
  va_number             text,                    -- untuk virtual account
  midtrans_order_id     text,
  midtrans_payload      jsonb,                   -- raw response dari Midtrans
  created_at            timestamptz DEFAULT now()
);

-- 3. Email Logs: Audit trail semua email terkirim
CREATE TABLE IF NOT EXISTS email_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_to              text NOT NULL,
  email_type            text NOT NULL,           -- 'welcome'|'invoice'|'renewal_reminder'|'payment_failed'
  subject               text,
  status                text DEFAULT 'sent',     -- 'sent'|'failed'|'bounced'
  resend_message_id     text,
  related_invoice_id    uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now()
);

-- 4. Tambah kolom ke subscriptions (jika belum ada)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS invoice_id         uuid REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS next_renewal_date  date,
  ADD COLUMN IF NOT EXISTS auto_renew         boolean DEFAULT true;

-- 5. AI Usage Logs: Token tracking per request
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  feature               text NOT NULL,           -- 'rab_parser'|'realisasi_chat'|'material_schedule'
  provider              text NOT NULL,           -- 'gemini'|'groq'|'claude'|'openrouter'
  model                 text,
  input_tokens          int NOT NULL DEFAULT 0,
  output_tokens         int NOT NULL DEFAULT 0,
  cost_usd              numeric(12,8) DEFAULT 0,
  cost_idr              int DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

-- 6. Budget Configs: Batas budget per provider (dikelola admin)
CREATE TABLE IF NOT EXISTS budget_configs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              text UNIQUE NOT NULL,    -- 'gemini'|'groq'|'claude'
  max_monthly_usd       numeric(10,2) NOT NULL DEFAULT 50,
  alert_threshold_pct   int NOT NULL DEFAULT 70,
  is_active             boolean DEFAULT true,
  updated_at            timestamptz DEFAULT now()
);

-- Insert default budget configs
INSERT INTO budget_configs (provider, max_monthly_usd, alert_threshold_pct) VALUES
  ('gemini',     50.00, 70),
  ('groq',       20.00, 70),
  ('claude',     30.00, 70),
  ('openrouter', 25.00, 70)
ON CONFLICT (provider) DO NOTHING;

-- Insert default PPN rate (11%)
-- Admin can update this via /admin/settings
INSERT INTO app_settings (key, value) VALUES ('ppn_rate', 0.11)
ON CONFLICT (key) DO NOTHING;

-- ── Row Level Security ──────────────────────────────────────

-- Invoices: User hanya bisa baca invoice miliknya
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can manage all invoices"
  ON invoices FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Payments: User bisa lihat payment sendiri
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can manage all payments"
  ON payments FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- AI Usage: User bisa baca miliknya, admin baca semua
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage"
  ON ai_usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Superadmin can view all usage"
  ON ai_usage_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- ── Auto-generate invoice number ────────────────────────────
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text AS $$
DECLARE
  year_month text := to_char(now(), 'YYYY-MM');
  count_today int;
  new_number text;
BEGIN
  SELECT COUNT(*) + 1 INTO count_today
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || year_month || '-%';
  
  new_number := 'INV-' || year_month || '-' || LPAD(count_today::text, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger: auto-set invoice_number on insert ──────────────
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_invoice_number ON invoices;
CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoice_number();
