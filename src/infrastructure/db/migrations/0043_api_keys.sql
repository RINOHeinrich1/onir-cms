-- 0043_api_keys.sql — clés d'API server-to-server, audit et index de recherche.
-- Isolation : une clé appartient à UNE organisation (active au moment de la
-- création). Le hash seul est stocké ; le secret n'est jamais persité.
-- Migration immuable : toute évolution passe par 0044+.

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['fiches:read']::text[],
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  last_used_ip inet
);

CREATE INDEX IF NOT EXISTS api_keys_org_created_idx
  ON api_keys (organization_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_uidx
  ON api_keys (key_prefix);

CREATE INDEX IF NOT EXISTS api_keys_hash_idx
  ON api_keys (key_hash);

CREATE TABLE IF NOT EXISTS api_key_audit (
  id bigserial PRIMARY KEY,
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event text NOT NULL,
  ip inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_key_audit_key_created_idx
  ON api_key_audit (api_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fiches_org_created_id_idx
  ON fiches (organization_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS fiches_search_idx
  ON fiches USING GIN (to_tsvector('simple', data::text));

CREATE INDEX IF NOT EXISTS conversations_link_idx
  ON conversations (organization_id, link_id);

COMMENT ON TABLE api_keys IS
  'Clés d''API server-to-server, hash uniquement, portée organisation.';
COMMENT ON COLUMN api_keys.key_hash IS
  'scrypt(secret, salt) — jamais le secret en clair.';
