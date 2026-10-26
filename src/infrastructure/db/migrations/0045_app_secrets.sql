-- 0045_app_secrets.sql — secrets applicatifs globaux (ADR-0036).
-- Les valeurs sont chiffrées côté application avec CONFIG_MASTER_KEY
-- (AES-256-GCM). Aucun secret en clair, aucune valeur renvoyée par l'API.
-- Migration immuable : toute évolution passe par 0046+.

CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY CHECK (
    key IN ('SESSION_SECRET', 'LINK_TOKEN_KEY', 'AI_PROVIDER_KEY', 'WEBHOOK_SECRET_KEY')
  ),
  value_enc text NOT NULL,
  fingerprint text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_secrets_version_check CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS app_secret_audit (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  action text NOT NULL CHECK (action IN ('import', 'generate', 'replace')),
  fingerprint_before text,
  fingerprint_after text NOT NULL,
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_secret_audit_key_created_idx
  ON app_secret_audit (key, created_at DESC);

COMMENT ON TABLE app_secrets IS
  'Secrets applicatifs globaux chiffrés avec CONFIG_MASTER_KEY.';
COMMENT ON COLUMN app_secrets.value_enc IS
  'v1:<iv>:<tag>:<ciphertext> (base64url), AAD onir:app-secret:<key>:v1.';
COMMENT ON COLUMN app_secrets.fingerprint IS
  'SHA-256 tronqué, utilisé pour l''audit sans exposer le secret.';
COMMENT ON TABLE app_secret_audit IS
  'Journal append-only des imports, générations et remplacements de secrets.';
