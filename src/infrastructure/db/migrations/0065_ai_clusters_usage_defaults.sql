-- 0065_ai_clusters_usage_defaults.sql — usages IA, clusters et overrides (ADR-0058).
-- Migration additive : les anciennes colonnes restent en place pour rollback.

CREATE TABLE IF NOT EXISTS ai_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  actif boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_clusters_label_unique UNIQUE (organization_id, label),
  CONSTRAINT ai_clusters_label_nonempty CHECK (btrim(label) <> '')
);

CREATE TABLE IF NOT EXISTS ai_cluster_members (
  cluster_id uuid NOT NULL REFERENCES ai_clusters (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  provider_id uuid NOT NULL,
  model text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (cluster_id, position),
  FOREIGN KEY (organization_id, provider_id)
    REFERENCES ai_providers (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT ai_cluster_members_model_nonempty CHECK (btrim(model) <> '')
);

CREATE INDEX IF NOT EXISTS ai_cluster_members_org_idx
  ON ai_cluster_members (organization_id, cluster_id, position);

CREATE TABLE IF NOT EXISTS organization_ai_usage_defaults (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  usage text NOT NULL CHECK (usage IN ('response', 'extraction', 'selection', 'summary', 'assistant')),
  target_kind text NOT NULL CHECK (target_kind IN ('model', 'cluster')),
  provider_id uuid,
  model text,
  cluster_id uuid REFERENCES ai_clusters (id) ON DELETE CASCADE,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, usage),
  CONSTRAINT organization_ai_usage_defaults_target_check CHECK (
    (target_kind = 'model' AND provider_id IS NOT NULL AND model IS NOT NULL AND cluster_id IS NULL)
    OR
    (target_kind = 'cluster' AND cluster_id IS NOT NULL AND provider_id IS NULL AND model IS NULL)
  ),
  FOREIGN KEY (organization_id, provider_id)
    REFERENCES ai_providers (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_link_ai_usage_overrides (
  chat_link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  usage text NOT NULL CHECK (usage IN ('response', 'extraction', 'selection', 'summary')),
  target_kind text NOT NULL CHECK (target_kind IN ('inherit', 'model', 'cluster')),
  provider_id uuid,
  model text,
  cluster_id uuid REFERENCES ai_clusters (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_link_id, usage),
  CONSTRAINT chat_link_ai_usage_overrides_target_check CHECK (
    (target_kind = 'inherit' AND provider_id IS NULL AND model IS NULL AND cluster_id IS NULL)
    OR
    (target_kind = 'model' AND provider_id IS NOT NULL AND model IS NOT NULL AND cluster_id IS NULL)
    OR
    (target_kind = 'cluster' AND cluster_id IS NOT NULL AND provider_id IS NULL AND model IS NULL)
  ),
  FOREIGN KEY (organization_id, provider_id)
    REFERENCES ai_providers (organization_id, id) ON DELETE CASCADE
);

-- Ancien défaut organisation -> défaut d'usage « response ».
INSERT INTO organization_ai_usage_defaults
  (organization_id, usage, target_kind, provider_id, model, updated_at)
SELECT organization_id, 'response', 'model', default_provider_id, default_model, updated_at
  FROM organization_ai_settings
 WHERE default_provider_id IS NOT NULL AND default_model IS NOT NULL
ON CONFLICT (organization_id, usage) DO NOTHING;

-- Ancienne affectation IA du lien -> override « response ».
INSERT INTO chat_link_ai_usage_overrides
  (chat_link_id, organization_id, usage, target_kind, provider_id, model)
SELECT id, organization_id, 'response', 'model', ai_provider_id, ai_model
  FROM chat_links
 WHERE ai_provider_id IS NOT NULL AND ai_model IS NOT NULL
ON CONFLICT (chat_link_id, usage) DO NOTHING;

-- Ancien couple extraction + secours -> cluster migré.
INSERT INTO ai_clusters (organization_id, label, description)
SELECT s.organization_id, 'Extraction migrée',
       'Cluster créé depuis le moteur d’extraction et son secours historiques.'
  FROM organization_ai_settings s
 WHERE s.extraction_provider_id IS NOT NULL
   AND s.extraction_model IS NOT NULL
   AND s.extraction_fallback_provider_id IS NOT NULL
   AND s.extraction_fallback_model IS NOT NULL
ON CONFLICT (organization_id, label) DO NOTHING;

INSERT INTO ai_cluster_members (cluster_id, organization_id, position, provider_id, model, enabled)
SELECT c.id, s.organization_id, 1, s.extraction_provider_id, s.extraction_model, true
  FROM organization_ai_settings s
  JOIN ai_clusters c
    ON c.organization_id = s.organization_id AND c.label = 'Extraction migrée'
 WHERE s.extraction_provider_id IS NOT NULL
   AND s.extraction_model IS NOT NULL
   AND s.extraction_fallback_provider_id IS NOT NULL
   AND s.extraction_fallback_model IS NOT NULL
ON CONFLICT (cluster_id, position) DO NOTHING;

INSERT INTO ai_cluster_members (cluster_id, organization_id, position, provider_id, model, enabled)
SELECT c.id, s.organization_id, 2, s.extraction_fallback_provider_id, s.extraction_fallback_model, true
  FROM organization_ai_settings s
  JOIN ai_clusters c
    ON c.organization_id = s.organization_id AND c.label = 'Extraction migrée'
 WHERE s.extraction_provider_id IS NOT NULL
   AND s.extraction_model IS NOT NULL
   AND s.extraction_fallback_provider_id IS NOT NULL
   AND s.extraction_fallback_model IS NOT NULL
ON CONFLICT (cluster_id, position) DO NOTHING;

INSERT INTO organization_ai_usage_defaults
  (organization_id, usage, target_kind, cluster_id, updated_at)
SELECT s.organization_id, 'extraction', 'cluster', c.id, s.updated_at
  FROM organization_ai_settings s
  JOIN ai_clusters c
    ON c.organization_id = s.organization_id AND c.label = 'Extraction migrée'
 WHERE s.extraction_provider_id IS NOT NULL
   AND s.extraction_model IS NOT NULL
   AND s.extraction_fallback_provider_id IS NOT NULL
   AND s.extraction_fallback_model IS NOT NULL
ON CONFLICT (organization_id, usage) DO NOTHING;

-- Extraction dédiée sans secours -> défaut d'usage « extraction » modèle.
INSERT INTO organization_ai_usage_defaults
  (organization_id, usage, target_kind, provider_id, model, updated_at)
SELECT organization_id, 'extraction', 'model',
       extraction_provider_id, extraction_model, updated_at
  FROM organization_ai_settings
 WHERE extraction_provider_id IS NOT NULL
   AND extraction_model IS NOT NULL
   AND (extraction_fallback_provider_id IS NULL OR extraction_fallback_model IS NULL)
ON CONFLICT (organization_id, usage) DO NOTHING;
