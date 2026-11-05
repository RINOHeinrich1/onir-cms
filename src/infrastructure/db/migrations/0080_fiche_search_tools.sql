-- 0080_fiche_search_tools.sql — ADR-0067.
-- Migration ADDITIVE uniquement : configuration versionnée de l'outil de
-- recherche et sessions serveur de pagination. Aucune reprise destructive.

ALTER TABLE chatbot_configs
  ADD COLUMN IF NOT EXISTS search_tool jsonb;

UPDATE chatbot_configs
   SET search_tool = '{"ficheTypes":[],"statusMode":"hidden_fixed","fixedStatusKeys":[],"sortMode":"fair_rotation","scope":"chat_link"}'::jsonb
 WHERE search_tool IS NULL;

ALTER TABLE chatbot_configs
  ALTER COLUMN search_tool
    SET DEFAULT '{"ficheTypes":[],"statusMode":"hidden_fixed","fixedStatusKeys":[],"sortMode":"fair_rotation","scope":"chat_link"}'::jsonb,
  ALTER COLUMN search_tool SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chatbot_configs_search_tool_object'
  ) THEN
    ALTER TABLE chatbot_configs
      ADD CONSTRAINT chatbot_configs_search_tool_object
      CHECK (jsonb_typeof(search_tool) = 'object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS chat_search_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  chat_link_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  criteria_json jsonb NOT NULL,
  ordered_fiche_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  total integer NOT NULL CHECK (total >= 0),
  "offset" integer NOT NULL DEFAULT 0 CHECK ("offset" >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (organization_id, chat_link_id)
    REFERENCES chat_links (organization_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(criteria_json) = 'object')
);

CREATE INDEX IF NOT EXISTS chat_search_sessions_conversation_idx
  ON chat_search_sessions (organization_id, chat_link_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_search_sessions_expires_idx
  ON chat_search_sessions (expires_at);
