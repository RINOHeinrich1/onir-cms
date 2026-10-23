-- 0039_ai_provider_models.sql — catalogue de modèles par fournisseur (ADR-0030).
-- Un fournisseur possède 0..N modèles. La table est la source de vérité de ce
-- que l'application propose ; la synchronisation /models ne fait qu'alimenter.
-- Aucun secret. Migration immuable : toute évolution passe par 0040+.

CREATE TABLE IF NOT EXISTS ai_provider_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  model_id text NOT NULL,
  label text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('catalog', 'manual')),
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_provider_models_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT ai_provider_models_provider_model_uidx UNIQUE (provider_id, model_id),
  CONSTRAINT ai_provider_models_model_check CHECK (length(btrim(model_id)) BETWEEN 1 AND 200),
  CONSTRAINT ai_provider_models_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  CONSTRAINT ai_provider_models_provider_fk
    FOREIGN KEY (organization_id, provider_id)
    REFERENCES ai_providers (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_provider_models_provider_enabled_idx
  ON ai_provider_models (provider_id, enabled, lower(label));

CREATE INDEX IF NOT EXISTS ai_provider_models_org_idx
  ON ai_provider_models (organization_id, provider_id);

-- Backfill : le modèle par défaut existant devient une ligne manuelle.
INSERT INTO ai_provider_models
  (organization_id, provider_id, model_id, label, source, enabled, last_seen_at)
SELECT
  organization_id,
  id,
  btrim(default_model),
  btrim(default_model),
  'manual',
  true,
  NULL
FROM ai_providers
WHERE default_model IS NOT NULL AND btrim(default_model) <> ''
ON CONFLICT (provider_id, model_id) DO NOTHING;

-- Backfill : le défaut d'organisation peut différer du défaut du fournisseur.
INSERT INTO ai_provider_models
  (organization_id, provider_id, model_id, label, source, enabled, last_seen_at)
SELECT
  organization_id,
  default_provider_id,
  btrim(default_model),
  btrim(default_model),
  'manual',
  true,
  NULL
FROM organization_ai_settings
WHERE default_provider_id IS NOT NULL
  AND default_model IS NOT NULL
  AND btrim(default_model) <> ''
ON CONFLICT (provider_id, model_id) DO NOTHING;

COMMENT ON TABLE ai_provider_models IS
  'Modèles gérés par fournisseur (catalogue synchronisé ou ajout manuel), ADR-0030.';
COMMENT ON COLUMN ai_provider_models.model_id IS
  'Identifiant exact envoyé à l''API OpenAI-compatible.';
COMMENT ON COLUMN ai_provider_models.source IS
  'catalog = synchronisé depuis /models ; manual = ajouté par un administrateur.';
COMMENT ON COLUMN ai_provider_models.enabled IS
  'Seuls les modèles actifs sont proposés pour un nouveau lien ou le défaut.';
COMMENT ON COLUMN ai_provider_models.last_seen_at IS
  'Dernière apparition dans le catalogue distant ; NULL pour un ajout manuel.';
