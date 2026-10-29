-- 0059_chatbot_configs_fiche_collecte.sql — ADR-0049.
-- Migration ADDITIVE uniquement : aucune reprise de données.
-- Les données de test sont réinitialisées par la commande explicite
-- `reset-all-chatbot-data`, jamais par cette migration.

CREATE TABLE IF NOT EXISTS chatbot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  chat_link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  system_prompt text NOT NULL DEFAULT '',
  simple_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  fiche_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_link_id, version),
  CHECK (jsonb_typeof(simple_settings) = 'object'),
  CHECK (jsonb_typeof(fiche_definitions) = 'array')
);

CREATE INDEX IF NOT EXISTS chatbot_configs_link_idx
  ON chatbot_configs (chat_link_id, version DESC);
CREATE INDEX IF NOT EXISTS chatbot_configs_org_idx
  ON chatbot_configs (organization_id, created_at DESC);

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS current_config_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_links_current_config_fk'
  ) THEN
    ALTER TABLE chat_links
      ADD CONSTRAINT chat_links_current_config_fk
      FOREIGN KEY (current_config_id) REFERENCES chatbot_configs (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_links_current_config_idx
  ON chat_links (current_config_id);

CREATE TABLE IF NOT EXISTS conversation_fiche_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES chatbot_configs (id) ON DELETE RESTRICT,
  fiche_key text NOT NULL,
  instance_key text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'active', 'paused', 'complete', 'abandoned')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields text[] NOT NULL DEFAULT '{}'::text[],
  abandon_reason text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, fiche_key, instance_key),
  CHECK (jsonb_typeof(data) = 'object')
);

CREATE INDEX IF NOT EXISTS conversation_fiche_instances_conversation_idx
  ON conversation_fiche_instances (conversation_id, status);
CREATE INDEX IF NOT EXISTS conversation_fiche_instances_config_idx
  ON conversation_fiche_instances (config_id);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_fiche_instances_one_active_idx
  ON conversation_fiche_instances (conversation_id)
  WHERE status = 'active';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS config_id uuid,
  ADD COLUMN IF NOT EXISTS active_fiche_instance_id uuid,
  ADD COLUMN IF NOT EXISTS outcome text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_config_fk'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_config_fk
      FOREIGN KEY (config_id) REFERENCES chatbot_configs (id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_active_fiche_instance_fk'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_active_fiche_instance_fk
      FOREIGN KEY (active_fiche_instance_id) REFERENCES conversation_fiche_instances (id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_outcome_check'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('fiches_creees', 'sans_fiche', 'abandonnee', 'erreur'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversations_config_idx
  ON conversations (config_id);

ALTER TABLE fiches
  ADD COLUMN IF NOT EXISTS config_id uuid,
  ADD COLUMN IF NOT EXISTS fiche_key text,
  ADD COLUMN IF NOT EXISTS fiche_instance_key text,
  ADD COLUMN IF NOT EXISTS conversation_fiche_instance_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fiches_config_fk'
  ) THEN
    ALTER TABLE fiches
      ADD CONSTRAINT fiches_config_fk
      FOREIGN KEY (config_id) REFERENCES chatbot_configs (id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fiches_conversation_fiche_instance_fk'
  ) THEN
    ALTER TABLE fiches
      ADD CONSTRAINT fiches_conversation_fiche_instance_fk
      FOREIGN KEY (conversation_fiche_instance_id)
      REFERENCES conversation_fiche_instances (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fiches_conversation_fiche_instance_uidx
  ON fiches (conversation_fiche_instance_id)
  WHERE conversation_fiche_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiches_config_key_idx
  ON fiches (organization_id, config_id, fiche_key, created_at DESC);

ALTER TABLE conversation_field_values
  ADD COLUMN IF NOT EXISTS fiche_instance_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_field_values_pkey'
  ) THEN
    ALTER TABLE conversation_field_values
      DROP CONSTRAINT conversation_field_values_pkey;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_field_values_instance_field_uidx
  ON conversation_field_values (
    conversation_id,
    COALESCE(fiche_instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
    field_name
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_field_values_fiche_instance_fk'
  ) THEN
    ALTER TABLE conversation_field_values
      ADD CONSTRAINT conversation_field_values_fiche_instance_fk
      FOREIGN KEY (fiche_instance_id) REFERENCES conversation_fiche_instances (id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversation_field_values_instance_idx
  ON conversation_field_values (conversation_id, fiche_instance_id);

ALTER TABLE base_connaissances
  ADD COLUMN IF NOT EXISTS chat_link_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE medias
  ADD COLUMN IF NOT EXISTS chat_link_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS base_connaissances_chat_links_idx
  ON base_connaissances USING GIN (chat_link_ids);
CREATE INDEX IF NOT EXISTS medias_chat_links_idx
  ON medias USING GIN (chat_link_ids);
