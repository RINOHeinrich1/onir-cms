-- 0038_ai_providers.sql — fournisseurs IA OpenAI-compatible (ADR-0029).
-- Les clés API sont chiffrées AES-256-GCM avec AI_PROVIDER_KEY ; aucun secret
-- en clair, aucun seed. Migration immuable : toute évolution passe par 0039+.

CREATE TABLE IF NOT EXISTS ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  label text NOT NULL,
  preset text NOT NULL CHECK (
    preset IN ('infomaniak', 'openai', 'deepseek', 'openrouter', 'deepinfra', 'custom')
  ),
  dialect text NOT NULL DEFAULT 'openai' CHECK (dialect IN ('openai', 'infomaniak')),
  base_url text NOT NULL,
  api_key_ciphertext text NOT NULL,
  api_key_iv text NOT NULL,
  api_key_tag text NOT NULL,
  api_key_hint text NOT NULL DEFAULT '',
  default_model text,
  archived_at timestamptz,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_providers_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT ai_providers_base_url_check CHECK (base_url ~ '^https?://'),
  CONSTRAINT ai_providers_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_providers_org_label_idx
  ON ai_providers (organization_id, lower(label));

CREATE INDEX IF NOT EXISTS ai_providers_org_archived_idx
  ON ai_providers (organization_id, archived_at, lower(label));

CREATE TABLE IF NOT EXISTS organization_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
  default_provider_id uuid,
  default_model text,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_ai_settings_provider_fk
    FOREIGN KEY (organization_id, default_provider_id)
    REFERENCES ai_providers (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT organization_ai_settings_pair_check
    CHECK ((default_provider_id IS NULL) = (default_model IS NULL))
);

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS ai_provider_id uuid;
ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS ai_model text;

ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_org_ai_provider_fk
  FOREIGN KEY (organization_id, ai_provider_id)
  REFERENCES ai_providers (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_ai_pair_check
  CHECK ((ai_provider_id IS NULL) = (ai_model IS NULL));

CREATE INDEX IF NOT EXISTS chat_links_org_ai_provider_idx
  ON chat_links (organization_id, ai_provider_id)
  WHERE ai_provider_id IS NOT NULL;

COMMENT ON TABLE ai_providers IS
  'Connexion OpenAI-compatible par organisation. La clé API est chiffrée et jamais exposée.';
COMMENT ON COLUMN ai_providers.api_key_ciphertext IS
  'Chiffré AES-256-GCM de la clé API fournisseur (jamais retourné au client).';
COMMENT ON COLUMN ai_providers.api_key_iv IS 'IV AES-256-GCM (base64).';
COMMENT ON COLUMN ai_providers.api_key_tag IS 'Tag d''authentification AES-256-GCM (base64).';
COMMENT ON COLUMN ai_providers.api_key_hint IS 'Indice affichable (••••1234), jamais la clé.';
COMMENT ON TABLE organization_ai_settings IS
  'Fournisseur et modèle IA par défaut d''une organisation (liens en mode hérité).';
COMMENT ON COLUMN chat_links.ai_provider_id IS
  'Fournisseur IA explicite du lien ; NULL = hériter du défaut de l''organisation.';
COMMENT ON COLUMN chat_links.ai_model IS
  'Modèle IA explicite du lien ; NULL = hériter du défaut de l''organisation.';
