-- 0071_organization_expiration_alert.sql — seuil d'alerte d'expiration des chatbots.
-- Réglage global à l'organisation ; l'expiration reste propre à chaque chatbot.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS expiration_alert_days integer NOT NULL DEFAULT 7;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_expiration_alert_days_check
  CHECK (expiration_alert_days >= 0 AND expiration_alert_days <= 365);
