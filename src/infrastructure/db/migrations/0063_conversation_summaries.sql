-- 0063_conversation_summaries.sql — résumé manuel par conversation (ADR-0054).
-- Objet séparé des fiches : une conversation peut avoir 0..1 résumé.
-- Une régénération écrase la ligne existante (pas d'historique de versions).

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL UNIQUE REFERENCES conversations (id) ON DELETE CASCADE,
  content text NOT NULL,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  tokens_used bigint NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  source_message_count integer NOT NULL DEFAULT 0 CHECK (source_message_count >= 0),
  source_last_message_at timestamptz,
  generated_while_finalized boolean NOT NULL DEFAULT false,
  generated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content <> '')
);

CREATE INDEX IF NOT EXISTS conversation_summaries_org_updated_idx
  ON conversation_summaries (organization_id, updated_at DESC);

COMMENT ON TABLE conversation_summaries IS
  'Résumé manuel de conversation (ADR-0054), indépendant des fiches de collecte.';
COMMENT ON COLUMN conversation_summaries.generated_while_finalized IS
  'true si le résumé a été généré après la finalisation de la conversation.';
