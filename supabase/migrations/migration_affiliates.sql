-- ============================================================
-- PropFS — Affiliate / Referral Programme Migration
-- ============================================================

-- 1. Tambah pengaturan Affiliate ke app_settings
INSERT INTO app_settings (key, value) VALUES 
('affiliate_enabled', 'false'),
('affiliate_commission_pct', '10')
ON CONFLICT (key) DO NOTHING;

-- 2. Modifikasi tabel profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. Trigger untuk generate referral_code otomatis saat insert profile
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  base_code TEXT;
  new_code TEXT;
  is_unique BOOLEAN := FALSE;
  counter INTEGER := 1;
BEGIN
  IF NEW.referral_code IS NULL THEN
    -- Ambil kata pertama dari nama, uppercase, buang karakter non-alphanumeric
    base_code := UPPER(REGEXP_REPLACE(SPLIT_PART(NEW.full_name, ' ', 1), '[^a-zA-Z0-9]', '', 'g'));
    IF LENGTH(base_code) < 3 THEN
      base_code := 'PRFS';
    END IF;
    
    -- Looping sampai dapat kode unik
    WHILE NOT is_unique LOOP
      -- Format: NAMA-XXXX (4 digit random)
      new_code := base_code || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);
      
      -- Cek keunikan
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = new_code) THEN
        is_unique := TRUE;
        NEW.referral_code := new_code;
      END IF;
      
      counter := counter + 1;
      IF counter > 100 THEN
        -- Fallback ke UUID pendek jika terjadi infinite loop ekstrim
        NEW.referral_code := 'PRFS-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 8);
        EXIT;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pasang trigger pada profiles
DROP TRIGGER IF EXISTS on_profile_created_referral ON profiles;
CREATE TRIGGER on_profile_created_referral
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_referral_code();

-- Generate referral code untuk user lama yang belum punya
UPDATE profiles 
SET referral_code = 'PRFS-' || SUBSTRING(MD5(id::TEXT) FROM 1 FOR 6)
WHERE referral_code IS NULL;

-- 4. Tabel referral_earnings
CREATE TABLE IF NOT EXISTS referral_earnings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  referred_user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  invoice_id          UUID REFERENCES invoices(id) ON DELETE SET NULL,
  commission_idr      INT NOT NULL,
  commission_pct      INT NOT NULL,
  status              TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'cancelled'
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS untuk referral_earnings
ALTER TABLE referral_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referral earnings" 
ON referral_earnings FOR SELECT TO authenticated
USING (auth.uid() = referrer_id);

CREATE POLICY "Superadmin can manage all referral earnings" 
ON referral_earnings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'));

GRANT ALL ON public.referral_earnings TO authenticated;
GRANT ALL ON public.referral_earnings TO service_role;
