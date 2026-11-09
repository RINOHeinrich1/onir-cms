-- 0087_chatbot_collection_mode.sql — stratégie de collecte du chatbot (ADR-0082).
-- Migration ADDITIVE : les configurations existantes restent en collecte IA.
ALTER TABLE chatbot_configs
  ADD COLUMN IF NOT EXISTS collection_mode text NOT NULL DEFAULT 'ai';

ALTER TABLE chatbot_configs
  DROP CONSTRAINT IF EXISTS chatbot_configs_collection_mode_check;

ALTER TABLE chatbot_configs
  ADD CONSTRAINT chatbot_configs_collection_mode_check
  CHECK (collection_mode IN ('ai', 'semi_heuristic'));
