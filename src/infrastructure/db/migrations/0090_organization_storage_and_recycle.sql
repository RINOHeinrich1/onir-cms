-- 0089_organization_storage_and_recycle.sql
-- Politique de remplissage des messages + quota global de stockage par organisation.

ALTER TABLE organization_ai_budgets
  ADD COLUMN IF NOT EXISTS message_limit_policy text NOT NULL DEFAULT 'block';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_ai_budgets_message_policy_check'
  ) THEN
    ALTER TABLE organization_ai_budgets
      ADD CONSTRAINT organization_ai_budgets_message_policy_check
      CHECK (message_limit_policy IN ('block', 'recycle'));
  END IF;
END $$;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_storage_bytes bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_max_storage_bytes_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_max_storage_bytes_check
      CHECK (max_storage_bytes IS NULL OR max_storage_bytes >= 0);
  END IF;
END $$;

ALTER TABLE medias
  ADD COLUMN IF NOT EXISTS size_bytes bigint;

COMMENT ON COLUMN organizations.max_storage_bytes IS
  'Quota global de stockage client en octets. NULL = illimité.';
COMMENT ON COLUMN organization_ai_budgets.message_limit_policy IS
  'Politique quand max_messages est atteint : block ou recycle.';
COMMENT ON COLUMN medias.size_bytes IS
  'Taille du fichier média en octets ; NULL pour les anciens médias non mesurés.';
