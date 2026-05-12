-- MIGRATION: Add Free Trial System --

-- 1. Tambah kolom trial ke tabel profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS trial_started_at  TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS trial_expires_at  TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_status      TEXT DEFAULT 'trial_active',
-- trial_status: 'trial_active' | 'trial_expired' | 'free_forever'
ADD COLUMN IF NOT EXISTS is_trial_extended BOOLEAN DEFAULT FALSE;

-- 2. Set trial_expires_at otomatis saat insert profile baru
-- Ambil durasi dari app_settings, default 30 hari
CREATE OR REPLACE FUNCTION set_trial_expiry()
RETURNS TRIGGER AS $$
DECLARE
  trial_days INTEGER;
BEGIN
  -- Ambil durasi trial dari settings, fallback 30 hari
  SELECT COALESCE(
    (SELECT (value::text)::integer 
     FROM app_settings 
     WHERE key = 'trial_duration_days'),
    30
  ) INTO trial_days;
  
  NEW.trial_started_at := NOW();
  NEW.trial_expires_at := NOW() + (trial_days || ' days')::INTERVAL;
  NEW.trial_status := 'trial_active';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger saat profile baru dibuat
DROP TRIGGER IF EXISTS on_profile_created_set_trial ON profiles;
CREATE TRIGGER on_profile_created_set_trial
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_trial_expiry();

-- 3. Function untuk cek dan update expired trials
-- Dipanggil otomatis atau manual oleh admin
CREATE OR REPLACE FUNCTION check_expired_trials()
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET trial_status = 'trial_expired'
  WHERE trial_status = 'trial_active'
    AND trial_expires_at < NOW()
    AND trial_expires_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Tambah setting trial_duration_days ke app_settings
INSERT INTO app_settings (key, value)
VALUES ('trial_duration_days', '30')
ON CONFLICT (key) DO NOTHING;

-- 5. Tambah setting trial_features ke app_settings
-- Mendefinisikan apa saja yang bisa diakses selama trial
INSERT INTO app_settings (key, value)
VALUES ('trial_features', '{
  "max_projects": 3,
  "can_export_pdf": true,
  "can_access_cashflow": true,
  "can_use_ai_parser": true,
  "ai_parser_limit": 3,
  "can_export_excel": false,
  "description": "Akses Starter selama masa trial"
}')
ON CONFLICT (key) DO NOTHING;

-- 6. Update profiles yang sudah ada (existing users)
-- Set mereka sebagai free_forever agar tidak terdampak
UPDATE profiles 
SET trial_status = 'free_forever',
    trial_expires_at = NULL
WHERE trial_started_at IS NULL 
   OR created_at < NOW() - INTERVAL '1 day';

-- Verifikasi migration berhasil
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN trial_status = 'trial_active' THEN 1 END) as trial_active,
  COUNT(CASE WHEN trial_status = 'trial_expired' THEN 1 END) as trial_expired,
  COUNT(CASE WHEN trial_status = 'free_forever' THEN 1 END) as free_forever
FROM profiles;
