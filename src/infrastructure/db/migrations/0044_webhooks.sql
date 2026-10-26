-- 0044_webhooks.sql — webhooks sortants par modèle de raisonnement (ADR-0035).
-- Les endpoints sont scopés à une organisation et à une clé de modèle.
-- Les secrets (auth et valeurs marquées secrètes) sont chiffrés côté application
-- avec WEBHOOK_SECRET_KEY ; aucune valeur secrète en clair n'est stockée.
-- Migration immuable : toute évolution passe par 0045+.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  template_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  http_method text NOT NULL,
  url text NOT NULL,
  query_params jsonb NOT NULL DEFAULT '[]'::jsonb,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_mode text NOT NULL DEFAULT 'json',
  body_template text NOT NULL DEFAULT '',
  field_mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  auth_type text NOT NULL DEFAULT 'none',
  auth_config_enc text,
  timeout_ms integer NOT NULL DEFAULT 10000,
  max_attempts integer NOT NULL DEFAULT 3,
  retry_backoff_ms integer NOT NULL DEFAULT 30000,
  follow_redirects boolean NOT NULL DEFAULT false,
  tls_verify boolean NOT NULL DEFAULT true,
  allow_insecure_http boolean NOT NULL DEFAULT false,
  allow_private_network boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT webhook_endpoints_method_check CHECK (
    http_method IN ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE')
  ),
  CONSTRAINT webhook_endpoints_body_mode_check CHECK (
    body_mode IN ('json', 'form_urlencoded', 'multipart', 'raw')
  ),
  CONSTRAINT webhook_endpoints_auth_type_check CHECK (
    auth_type IN (
      'none', 'bearer', 'basic', 'api_key_header', 'api_key_query', 'hmac',
      'oauth2_client_credentials'
    )
  ),
  CONSTRAINT webhook_endpoints_timeout_check CHECK (timeout_ms BETWEEN 1000 AND 30000),
  CONSTRAINT webhook_endpoints_attempts_check CHECK (max_attempts BETWEEN 1 AND 5),
  CONSTRAINT webhook_endpoints_backoff_check CHECK (retry_backoff_ms BETWEEN 1000 AND 900000)
);

CREATE INDEX IF NOT EXISTS webhook_endpoints_org_created_idx
  ON webhook_endpoints (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_endpoints_org_template_idx
  ON webhook_endpoints (organization_id, template_key, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS webhook_endpoints_org_name_idx
  ON webhook_endpoints (organization_id, lower(name));

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints (id),
  fiche_id uuid REFERENCES fiches (id) ON DELETE SET NULL,
  template_key text NOT NULL,
  template_version integer NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  replay_of_id uuid REFERENCES webhook_deliveries (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  idempotency_key text NOT NULL,
  request_snapshot jsonb,
  response_status integer,
  response_body text,
  error_code text,
  error_message text,
  triggered_by uuid REFERENCES users (id) ON DELETE SET NULL,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_status_check CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed')
  ),
  CONSTRAINT webhook_deliveries_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_org_created_idx
  ON webhook_deliveries (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_created_idx
  ON webhook_deliveries (endpoint_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_fiche_created_idx
  ON webhook_deliveries (fiche_id, created_at DESC)
  WHERE fiche_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_deliveries_queue_idx
  ON webhook_deliveries (status, next_attempt_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS webhook_deliveries_idempotency_idx
  ON webhook_deliveries (organization_id, idempotency_key);

CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id bigserial PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES webhook_deliveries (id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  status text NOT NULL,
  http_status integer,
  error_code text,
  error_message text,
  duration_ms integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_delivery_attempts_attempt_check CHECK (attempt >= 1)
);

CREATE INDEX IF NOT EXISTS webhook_delivery_attempts_delivery_idx
  ON webhook_delivery_attempts (delivery_id, attempt);

COMMENT ON TABLE webhook_endpoints IS
  'Webhooks sortants configurables, rattachés à un modèle de raisonnement.';
COMMENT ON COLUMN webhook_endpoints.auth_config_enc IS
  'Configuration d''authentification scellée (AES-256-GCM, WEBHOOK_SECRET_KEY).';
COMMENT ON COLUMN webhook_endpoints.headers IS
  'Liste JSON {name,value,secret} ; les valeurs secrètes sont scellées.';
COMMENT ON COLUMN webhook_endpoints.query_params IS
  'Liste JSON {name,value,secret} ; les valeurs secrètes sont scellées.';
COMMENT ON COLUMN webhook_endpoints.field_mappings IS
  'Mapping source → clé cible, avec obligation et mode fichier.';
COMMENT ON TABLE webhook_deliveries IS
  'Exécutions de webhooks, file PostgreSQL et journal de livraison.';
COMMENT ON COLUMN webhook_deliveries.request_snapshot IS
  'Instantané d''audit (headers sensibles masqués, corps tronqué).';
COMMENT ON TABLE webhook_delivery_attempts IS
  'Traces append-only des tentatives de livraison.';
