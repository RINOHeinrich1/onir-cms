-- 0055_ai_reasoning_mode.sql — contrôle du raisonnement par modèle (ADR-0047).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE ai_provider_models
  ADD COLUMN IF NOT EXISTS reasoning_mode text NOT NULL DEFAULT 'auto'
  CHECK (reasoning_mode IN ('auto', 'enabled', 'disabled'));
