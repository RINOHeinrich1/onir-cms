-- 0021_organizations_schema.sql — socle multitenant (ADR-0025)
-- Crée les organisations, les memberships, les assignations de templates visuels
-- et les colonnes de contexte tenant sur users/sessions.
-- Migration additive : l'ancien process reste compatible pendant le déploiement.

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  suspended_at timestamptz,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_lower_idx ON organizations (lower(name));

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'marketeur', 'lecteur')),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members (user_id);

CREATE TABLE IF NOT EXISTS organization_visual_templates (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES visual_templates (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, template_id)
);

CREATE INDEX IF NOT EXISTS organization_visual_templates_template_idx
  ON organization_visual_templates (template_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_organization_id uuid
  REFERENCES organizations (id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_organization_id uuid
  REFERENCES organizations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_active_organization_idx
  ON sessions (active_organization_id);

COMMENT ON COLUMN users.role IS
  'LEGACY (ADR-0025) : conservé pour compatibilité ; l''autorisation utilise organization_members.role.';
COMMENT ON COLUMN sessions.active_organization_id IS
  'Organisation active de la session (ADR-0025). Jamais fournie par le client.';
