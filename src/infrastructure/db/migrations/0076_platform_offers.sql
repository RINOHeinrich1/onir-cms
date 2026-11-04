-- 0076_platform_offers.sql — offres réutilisables du super-admin (ADR-0065).
-- Une offre est un snapshot de provisioning copié dans l'invitation, puis dans
-- l'organisation à l'acceptation. Aucun compteur n'est créé ou réinitialisé ici.

CREATE TABLE IF NOT EXISTS platform_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  provisioning jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_offers_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT platform_offers_provisioning_object_check
    CHECK (jsonb_typeof(provisioning) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_offers_name_uidx
  ON platform_offers (lower(name));

ALTER TABLE organization_invitations
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES platform_offers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_invitations_offer_idx
  ON organization_invitations (offer_id)
  WHERE offer_id IS NOT NULL;
