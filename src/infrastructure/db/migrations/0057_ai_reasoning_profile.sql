-- 0057_ai_reasoning_profile.sql — profil de raisonnement configurable (ADR-0047).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE ai_providers
  ADD COLUMN IF NOT EXISTS reasoning_profile text NOT NULL DEFAULT 'auto'
  CHECK (reasoning_profile IN (
    'auto', 'none', 'infomaniak_chat_template',
    'openai_reasoning_effort', 'openrouter_reasoning'
  ));
