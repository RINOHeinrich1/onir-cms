-- 0089_organization_visual_template_installation.sql — installations et audit (ADR-0090)
-- Migration additive : aucune installation existante n'est supprimée.

ALTER TABLE organization_visual_templates
  ADD COLUMN IF NOT EXISTS installed_by uuid
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy';

UPDATE organization_visual_templates
   SET source = 'legacy'
 WHERE source IS NULL;

ALTER TABLE organization_visual_templates
  DROP CONSTRAINT IF EXISTS organization_visual_templates_source_check;

ALTER TABLE organization_visual_templates
  ADD CONSTRAINT organization_visual_templates_source_check
  CHECK (source IN (
    'legacy',
    'platform_default',
    'platform_admin',
    'organization_upload',
    'organization_admin'
  ));

CREATE INDEX IF NOT EXISTS organization_visual_templates_org_installed_idx
  ON organization_visual_templates (organization_id, installed_at DESC);

CREATE TABLE IF NOT EXISTS visual_template_audit (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  template_id uuid REFERENCES visual_templates(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN (
    'upload',
    'install',
    'uninstall',
    'platform_install',
    'platform_uninstall',
    'disable',
    'enable'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visual_template_audit_org_created_idx
  ON visual_template_audit (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS visual_template_audit_template_created_idx
  ON visual_template_audit (template_id, created_at DESC);

COMMENT ON TABLE visual_template_audit IS
  'Journal append-only des uploads, installations et désactivations de templates (ADR-0090).';
