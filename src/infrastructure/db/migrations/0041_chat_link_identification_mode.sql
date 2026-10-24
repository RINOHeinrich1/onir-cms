-- 0041_chat_link_identification_mode.sql — mode d'identification du visiteur.
-- Valeurs actives : contact | anonymous. otp | internal sont réservés (ADR-0033).
-- Migration immuable : toute évolution passe par 0042+.

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS identification_mode text NOT NULL DEFAULT 'contact';

ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_identification_mode_check
  CHECK (identification_mode IN ('contact', 'anonymous', 'otp', 'internal'));

COMMENT ON COLUMN chat_links.identification_mode IS
  'Mode d''identification du visiteur : contact | anonymous (otp/internal réservés, ADR-0033).';
