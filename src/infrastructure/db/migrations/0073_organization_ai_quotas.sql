-- 0073_organization_ai_quotas.sql — limites d'organisation et comptage IA (ADR-0065).
-- Migration strictement additive : aucun compteur existant n'est réinitialisé,
-- aucun historique n'est backfillé et `chat_links.tokens_used` reste intact.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_chatbots integer;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_max_chatbots_check
  CHECK (max_chatbots IS NULL OR (max_chatbots >= 0 AND max_chatbots <= 1000000));

-- Budget global de tokens d'une organisation. L'absence de ligne = illimité.
-- La ligne n'est créée qu'au moment où le super-admin configure une limite.
CREATE TABLE IF NOT EXISTS organization_ai_budgets (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
  max_tokens bigint,
  tokens_used bigint NOT NULL DEFAULT 0,
  token_reset_mode text NOT NULL DEFAULT 'manual',
  token_reset_days integer,
  token_period_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_ai_budgets_max_tokens_check
    CHECK (max_tokens IS NULL OR max_tokens >= 0),
  CONSTRAINT organization_ai_budgets_tokens_used_check
    CHECK (tokens_used >= 0),
  CONSTRAINT organization_ai_budgets_reset_mode_check
    CHECK (token_reset_mode IN ('manual', 'duration')),
  CONSTRAINT organization_ai_budgets_reset_days_check
    CHECK (
      (token_reset_mode = 'manual' AND token_reset_days IS NULL)
      OR
      (token_reset_mode = 'duration' AND token_reset_days BETWEEN 1 AND 3650)
    )
);

-- Quotas par couple fournisseur/modèle ou par cluster. Un seul type de cible
-- est renseigné par ligne. Les compteurs sont propres à la période courante.
CREATE TABLE IF NOT EXISTS organization_ai_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  target_kind text NOT NULL,
  provider_id uuid REFERENCES ai_providers (id) ON DELETE CASCADE,
  model text,
  cluster_id uuid REFERENCES ai_clusters (id) ON DELETE CASCADE,
  max_tokens bigint,
  tokens_used bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_ai_allocations_target_kind_check
    CHECK (target_kind IN ('model', 'cluster')),
  CONSTRAINT organization_ai_allocations_target_check
    CHECK (
      (target_kind = 'model' AND provider_id IS NOT NULL AND model IS NOT NULL AND btrim(model) <> '' AND cluster_id IS NULL)
      OR
      (target_kind = 'cluster' AND cluster_id IS NOT NULL AND provider_id IS NULL AND model IS NULL)
    ),
  CONSTRAINT organization_ai_allocations_max_tokens_check
    CHECK (max_tokens IS NULL OR max_tokens >= 0),
  CONSTRAINT organization_ai_allocations_tokens_used_check
    CHECK (tokens_used >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_ai_allocations_model_uidx
  ON organization_ai_allocations (organization_id, provider_id, model)
  WHERE target_kind = 'model';

CREATE UNIQUE INDEX IF NOT EXISTS organization_ai_allocations_cluster_uidx
  ON organization_ai_allocations (organization_id, cluster_id)
  WHERE target_kind = 'cluster';

CREATE INDEX IF NOT EXISTS organization_ai_allocations_org_idx
  ON organization_ai_allocations (organization_id, target_kind);

-- Journal append-only de tous les appels IA. Il ne porte aucun compteur et
-- n'est jamais réécrit par une migration ou un reset.
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider_id uuid,
  provider_label text NOT NULL DEFAULT '',
  model text NOT NULL,
  cluster_id uuid,
  usage text NOT NULL,
  link_id uuid,
  conversation_id uuid,
  user_id uuid,
  prompt_tokens bigint NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens bigint NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens bigint NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_org_created_idx
  ON ai_usage_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_org_model_idx
  ON ai_usage_events (organization_id, provider_id, model, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_org_cluster_idx
  ON ai_usage_events (organization_id, cluster_id, created_at DESC)
  WHERE cluster_id IS NOT NULL;

-- Invariant fort pour les créations concurrentes de chatbots. Le contrôle
-- applicatif reste utile pour un message métier, mais la base garantit que
-- deux insertions simultanées ne dépassent pas la limite.
CREATE OR REPLACE FUNCTION enforce_organization_max_chatbots()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed integer;
  current_count integer;
BEGIN
  SELECT o.max_chatbots
    INTO allowed
    FROM organizations o
   WHERE o.id = NEW.organization_id
   FOR UPDATE;

  IF allowed IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
    INTO current_count
    FROM chat_links
   WHERE organization_id = NEW.organization_id;

  IF current_count >= allowed THEN
    RAISE EXCEPTION 'organization_chatbot_limit_reached'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_links_organization_max_chatbots_trg ON chat_links;
CREATE TRIGGER chat_links_organization_max_chatbots_trg
  BEFORE INSERT ON chat_links
  FOR EACH ROW
  EXECUTE FUNCTION enforce_organization_max_chatbots();

COMMENT ON COLUMN organizations.max_chatbots IS
  'Nombre maximal de chatbots de l''organisation ; NULL = illimité (ADR-0065).';
COMMENT ON TABLE organization_ai_budgets IS
  'Budget global de tokens par organisation et période (ADR-0065). Aucun backfill.';
COMMENT ON TABLE organization_ai_allocations IS
  'Quotas de tokens par fournisseur/modèle ou par cluster (ADR-0065).';
COMMENT ON TABLE ai_usage_events IS
  'Journal append-only des appels IA, toutes fonctionnalités confondues (ADR-0065).';
