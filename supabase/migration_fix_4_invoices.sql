-- ============================================================
-- MIGRATION FIX 4: Create INVOICES table
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- The invoices table was missing from the original schema.
-- The frontend code references this table but it was never created.

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
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'failed' | 'cancelled'
  payment_method  TEXT,
  midtrans_order_id TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Users can INSERT their own invoices
CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can SELECT their own invoices
CREATE POLICY "Users can read own invoices"
  ON invoices FOR SELECT
  USING (auth.uid() = user_id);

-- Users can UPDATE their own invoices (status change after payment)
CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  USING (auth.uid() = user_id);

-- Superadmin can READ ALL invoices
CREATE POLICY "Superadmin can read all invoices"
  ON invoices FOR SELECT
  USING (public.is_superadmin());

-- Superadmin can UPDATE ALL invoices (manual payment verification)
CREATE POLICY "Superadmin can update all invoices"
  ON invoices FOR UPDATE
  USING (public.is_superadmin());

-- DONE! After running this, invoices will be saved to the database.
