-- 0066_chatbot_configs_fallback.sql — fallback heuristique du chatbot (ADR-0059).
-- Migration ADDITIVE : les configurations existantes restent sans fallback actif.

ALTER TABLE chatbot_configs
  ADD COLUMN IF NOT EXISTS fallback jsonb;

UPDATE chatbot_configs
   SET fallback = '{"enabled":false,"intro":"L’assistant est momentanément indisponible. Choisissez une option.","questions":[],"showCollectionForm":true}'::jsonb
 WHERE fallback IS NULL;

ALTER TABLE chatbot_configs
  ALTER COLUMN fallback SET DEFAULT '{"enabled":false,"intro":"L’assistant est momentanément indisponible. Choisissez une option.","questions":[],"showCollectionForm":true}'::jsonb,
  ALTER COLUMN fallback SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chatbot_configs_fallback_object'
  ) THEN
    ALTER TABLE chatbot_configs
      ADD CONSTRAINT chatbot_configs_fallback_object
      CHECK (jsonb_typeof(fallback) = 'object');
  END IF;
END $$;
