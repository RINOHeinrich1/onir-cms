-- 0088_visual_template_ownership.sql — templates plateforme vs organisation (ADR-0090)
-- Migration additive : les templates existants restent des templates plateforme.

ALTER TABLE visual_templates
  ADD COLUMN IF NOT EXISTS owner_organization_id uuid
    REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disabled_reason text;

DROP INDEX IF EXISTS visual_templates_key_idx;

CREATE UNIQUE INDEX IF NOT EXISTS visual_templates_platform_key_idx
  ON visual_templates (lower(key))
  WHERE owner_organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS visual_templates_org_key_idx
  ON visual_templates (owner_organization_id, lower(key))
  WHERE owner_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS visual_templates_owner_org_idx
  ON visual_templates (owner_organization_id)
  WHERE owner_organization_id IS NOT NULL;

COMMENT ON COLUMN visual_templates.owner_organization_id IS
  'NULL = template plateforme ; sinon template privé de cette organisation (ADR-0090).';
COMMENT ON COLUMN visual_templates.disabled_at IS
  'Désactivation d''urgence plateforme : le template n''est plus listé ni rendu (ADR-0090).';

CREATE OR REPLACE FUNCTION visual_templates_owner_limit_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owned_count integer;
BEGIN
  IF NEW.owner_organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('visual_templates_owner:' || NEW.owner_organization_id::text)::bigint);
  SELECT count(*)::integer
    INTO owned_count
    FROM visual_templates
   WHERE owner_organization_id = NEW.owner_organization_id;
  IF owned_count >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 templates propriétaires atteinte'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visual_templates_owner_limit_trg ON visual_templates;
CREATE TRIGGER visual_templates_owner_limit_trg
  BEFORE INSERT ON visual_templates
  FOR EACH ROW EXECUTE FUNCTION visual_templates_owner_limit_guard();
