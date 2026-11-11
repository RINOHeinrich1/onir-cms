-- 0088_organization_message_limits.sql — plafond de messages par organisation.
-- Un `max_messages` NULL signifie aucune limite. Le compteur suit la même
-- période que le budget de tokens.

ALTER TABLE organization_ai_budgets
  ADD COLUMN IF NOT EXISTS max_messages bigint;

ALTER TABLE organization_ai_budgets
  ADD COLUMN IF NOT EXISTS messages_used bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_ai_budgets_max_messages_check'
  ) THEN
    ALTER TABLE organization_ai_budgets
      ADD CONSTRAINT organization_ai_budgets_max_messages_check
      CHECK (max_messages IS NULL OR max_messages >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_ai_budgets_messages_used_check'
  ) THEN
    ALTER TABLE organization_ai_budgets
      ADD CONSTRAINT organization_ai_budgets_messages_used_check
      CHECK (messages_used >= 0);
  END IF;
END $$;

COMMENT ON COLUMN organization_ai_budgets.max_messages IS
  'Plafond de messages utilisateur par période. NULL = illimité.';
COMMENT ON COLUMN organization_ai_budgets.messages_used IS
  'Messages utilisateur consommés sur la période courante.';
