-- 0061_chatbot_configs_data_selection.sql — sélection des données globales.
-- Migration ADDITIVE : les configurations existantes restent en mode `all`.

ALTER TABLE chatbot_configs
  ADD COLUMN IF NOT EXISTS data_selection jsonb;

UPDATE chatbot_configs
   SET data_selection = '{"mode":"all","connaissanceIds":[],"mediaIds":[]}'::jsonb
 WHERE data_selection IS NULL;

ALTER TABLE chatbot_configs
  ALTER COLUMN data_selection SET DEFAULT '{"mode":"all","connaissanceIds":[],"mediaIds":[]}'::jsonb,
  ALTER COLUMN data_selection SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chatbot_configs_data_selection_object'
  ) THEN
    ALTER TABLE chatbot_configs
      ADD CONSTRAINT chatbot_configs_data_selection_object
      CHECK (jsonb_typeof(data_selection) = 'object');
  END IF;
END $$;
