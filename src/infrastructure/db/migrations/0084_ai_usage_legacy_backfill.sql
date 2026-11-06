-- 0084_ai_usage_legacy_backfill.sql — réconciliation de l'historique IA.
--
-- Le journal `ai_usage_events` a été introduit par la migration 0073 sans
-- backfill. Les consommations antérieures restent dans `chat_link_ai_usage`.
-- Cette migration importe une seule fois ces lignes historiques, en les
-- identifiant par `legacy_usage_id` pour rendre l'opération idempotente.
--
-- Les lignes legacy postérieures au journal ne sont pas importées : elles
-- doublonnent les événements `live` déjà écrits par le runtime.

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS legacy_usage_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'ai_usage_events'::regclass
       AND conname = 'ai_usage_events_source_check'
  ) THEN
    ALTER TABLE ai_usage_events
      ADD CONSTRAINT ai_usage_events_source_check
      CHECK (source IN ('live', 'legacy_backfill'));
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_events_legacy_usage_uidx
  ON ai_usage_events (legacy_usage_id)
  WHERE legacy_usage_id IS NOT NULL;

WITH cutover AS (
  SELECT applied_at
    FROM schema_migrations
   WHERE name = '0073_organization_ai_quotas.sql'
)
INSERT INTO ai_usage_events
  (organization_id, provider_id, provider_label, model, cluster_id,
   usage, link_id, conversation_id, user_id,
   prompt_tokens, completion_tokens, total_tokens, created_at,
   source, legacy_usage_id)
SELECT
  u.organization_id,
  NULL,
  'Historique pré-journal',
  'legacy-import',
  NULL,
  u.operation,
  u.link_id,
  u.conversation_id,
  NULL,
  u.prompt_tokens,
  u.completion_tokens,
  u.total_tokens,
  u.created_at,
  'legacy_backfill',
  u.id
FROM chat_link_ai_usage u
CROSS JOIN cutover c
WHERE u.created_at < c.applied_at
ON CONFLICT (legacy_usage_id) WHERE legacy_usage_id IS NOT NULL DO NOTHING;

COMMENT ON COLUMN ai_usage_events.source IS
  'live = écrit par le runtime ; legacy_backfill = import unique depuis chat_link_ai_usage.';
COMMENT ON COLUMN ai_usage_events.legacy_usage_id IS
  'Identifiant de la ligne chat_link_ai_usage importée, pour éviter tout double comptage.';
