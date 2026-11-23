-- 0100_standalone_builds_domains.sql — socle build standalone et domaines (ADR-0106)
-- Migration strictement additive : aucune table existante n'est modifiée.

CREATE TABLE IF NOT EXISTS chatbot_standalone_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  chat_link_id uuid NOT NULL,
  build_number integer NOT NULL CHECK (build_number > 0),
  template_id uuid REFERENCES visual_templates (id) ON DELETE SET NULL,
  template_version text,
  config_hash text NOT NULL,
  artifact_key text,
  artifact_sha256 text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'building', 'ready', 'failed', 'active', 'superseded')),
  error text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  superseded_at timestamptz,
  CONSTRAINT chatbot_standalone_builds_link_fk
    FOREIGN KEY (organization_id, chat_link_id)
    REFERENCES chat_links (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT chatbot_standalone_builds_link_number_uidx
    UNIQUE (chat_link_id, build_number),
  CONSTRAINT chatbot_standalone_builds_template_pair_check
    CHECK (
      (template_id IS NULL AND template_version IS NULL) OR
      (template_id IS NOT NULL AND template_version IS NOT NULL)
    ),
  CONSTRAINT chatbot_standalone_builds_ready_artifact_check
    CHECK (status NOT IN ('ready', 'active') OR (artifact_key IS NOT NULL AND artifact_sha256 IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS chatbot_standalone_builds_link_idx
  ON chatbot_standalone_builds (chat_link_id, build_number DESC);
CREATE INDEX IF NOT EXISTS chatbot_standalone_builds_status_idx
  ON chatbot_standalone_builds (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS chatbot_standalone_builds_active_uidx
  ON chatbot_standalone_builds (chat_link_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS chatbot_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  chat_link_id uuid NOT NULL,
  hostname text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('platform_subdomain', 'custom_domain')),
  is_primary boolean NOT NULL DEFAULT false,
  verification_token text,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verifying', 'verified', 'failed')),
  ssl_status text NOT NULL DEFAULT 'pending'
    CHECK (ssl_status IN ('pending', 'issuing', 'active', 'failed', 'expired')),
  last_checked_at timestamptz,
  activated_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_domains_link_fk
    FOREIGN KEY (organization_id, chat_link_id)
    REFERENCES chat_links (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT chatbot_domains_hostname_normalized_check
    CHECK (hostname = lower(hostname)),
  CONSTRAINT chatbot_domains_hostname_format_check
    CHECK (length(hostname) BETWEEN 1 AND 253 AND hostname LIKE '%.%')
);

CREATE UNIQUE INDEX IF NOT EXISTS chatbot_domains_hostname_uidx
  ON chatbot_domains (hostname);
CREATE INDEX IF NOT EXISTS chatbot_domains_link_idx
  ON chatbot_domains (chat_link_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS chatbot_domains_primary_uidx
  ON chatbot_domains (chat_link_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS chatbot_standalone_settings (
  chat_link_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  active_build_id uuid REFERENCES chatbot_standalone_builds (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_standalone_settings_link_fk
    FOREIGN KEY (organization_id, chat_link_id)
    REFERENCES chat_links (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chatbot_standalone_settings_org_idx
  ON chatbot_standalone_settings (organization_id, enabled);

COMMENT ON TABLE chatbot_standalone_builds IS
  'Builds statiques immuables du front public, rattachés à un chatbot (ADR-0106).';
COMMENT ON TABLE chatbot_domains IS
  'Domaines publics rattachés à un chatbot ; le domaine est unique globalement.';
COMMENT ON TABLE chatbot_standalone_settings IS
  'Activation du mode standalone et build actif, désactivé par défaut.';
