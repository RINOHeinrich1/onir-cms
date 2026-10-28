-- 0058_chatbot_quotas.sql — quotas par chatbot et audit des tokens (ADR-0048).
-- Les fiches sont comptées à vie ; les tokens sont comptés par période
-- (réinitialisation manuelle ou automatique après N jours).

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS max_fiches integer,
  ADD COLUMN IF NOT EXISTS max_tokens bigint,
  ADD COLUMN IF NOT EXISTS token_reset_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS token_reset_days integer,
  ADD COLUMN IF NOT EXISTS tokens_used bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_period_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fiches_generated integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_links_max_fiches_check'
  ) THEN
    ALTER TABLE chat_links
      ADD CONSTRAINT chat_links_max_fiches_check
      CHECK (max_fiches IS NULL OR max_fiches >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_links_max_tokens_check'
  ) THEN
    ALTER TABLE chat_links
      ADD CONSTRAINT chat_links_max_tokens_check
      CHECK (max_tokens IS NULL OR max_tokens >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_links_token_reset_mode_check'
  ) THEN
    ALTER TABLE chat_links
      ADD CONSTRAINT chat_links_token_reset_mode_check
      CHECK (token_reset_mode IN ('manual', 'duration'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_links_token_reset_days_check'
  ) THEN
    ALTER TABLE chat_links
      ADD CONSTRAINT chat_links_token_reset_days_check
      CHECK (
        (token_reset_mode = 'manual' AND token_reset_days IS NULL)
        OR (token_reset_mode = 'duration' AND token_reset_days BETWEEN 1 AND 3650)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_links_tokens_used_check'
  ) THEN
    ALTER TABLE chat_links
      ADD CONSTRAINT chat_links_tokens_used_check
      CHECK (tokens_used >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_links_fiches_generated_check'
  ) THEN
    ALTER TABLE chat_links
      ADD CONSTRAINT chat_links_fiches_generated_check
      CHECK (fiches_generated >= 0);
  END IF;
END $$;

-- Compteur historique : chaque fiche est rattachée à une conversation, qui
-- porte le chatbot. Les fiches sans conversation ne sont pas imputables.
UPDATE chat_links l
   SET fiches_generated = counts.total
  FROM (
    SELECT cv.link_id, count(*)::int AS total
      FROM fiches f
      JOIN conversations cv ON cv.id = f.conversation_id
     GROUP BY cv.link_id
  ) counts
 WHERE l.id = counts.link_id;

CREATE TABLE IF NOT EXISTS chat_link_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations (id) ON DELETE SET NULL,
  operation text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_link_ai_usage_link_created_idx
  ON chat_link_ai_usage (link_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_link_ai_usage_org_created_idx
  ON chat_link_ai_usage (organization_id, created_at DESC);

COMMENT ON COLUMN chat_links.max_fiches IS
  'Nombre maximal de fiches générées par ce chatbot, à vie. NULL = illimité.';
COMMENT ON COLUMN chat_links.max_tokens IS
  'Budget maximal de tokens IA par période. NULL = illimité.';
COMMENT ON COLUMN chat_links.token_reset_mode IS
  'manual : réinitialisation par un admin ; duration : reset automatique après token_reset_days.';
COMMENT ON COLUMN chat_links.fiches_generated IS
  'Compteur atomique des fiches générées (source de vérité du quota).';
COMMENT ON TABLE chat_link_ai_usage IS
  'Audit des tokens consommés par chatbot, toutes opérations IA confondues (ADR-0048).';
