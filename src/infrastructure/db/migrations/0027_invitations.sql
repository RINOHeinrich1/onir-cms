-- 0027_invitations.sql — invitations utilisateurs par lien
-- Le numéro 0026 reste réservé au contrat de retrait des DEFAULT legacy
-- (docs/multitenancy/contract-0026.md).
-- Le jeton est stocké sous deux formes : hash SHA-256 (recherche) et chiffré
-- réversible (ré-affichage du lien à l'admin). Aucune valeur en clair.

ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  token_enc text NOT NULL,
  organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'marketeur', 'lecteur')),
  invited_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  accepted_email text,
  accepted_name text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_invitations_scope_check
    CHECK (organization_id IS NOT NULL OR role = 'admin')
);

CREATE INDEX IF NOT EXISTS organization_invitations_org_created_idx
  ON organization_invitations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_invitations_pending_expiry_idx
  ON organization_invitations (expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
