-- 0036_template_reader_validity.sql — durée de validité du mot de passe lecteur.
-- 0 = pas d'expiration. Une valeur > 0 applique VALID UNTIL au rôle et permet
-- la rotation automatique avant échéance côté runtime.

ALTER TABLE template_reader_credentials
  ADD COLUMN IF NOT EXISTS validity_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'template_reader_credentials_validity_check'
  ) THEN
    ALTER TABLE template_reader_credentials
      ADD CONSTRAINT template_reader_credentials_validity_check
      CHECK (validity_days >= 0 AND validity_days <= 3650);
  END IF;
END;
$$;
