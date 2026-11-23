-- 0098_visual_template_version_lifecycle.sql — cycle de vie des versions (ADR-0103)
-- Migration additive : les versions existantes restent utilisables.

ALTER TABLE visual_template_versions
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS last_error_detail jsonb,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disabled_reason text;

ALTER TABLE visual_template_versions
  DROP CONSTRAINT IF EXISTS visual_template_versions_health_status_check;

ALTER TABLE visual_template_versions
  ADD CONSTRAINT visual_template_versions_health_status_check
  CHECK (health_status IN ('unknown', 'ok', 'error'));

CREATE INDEX IF NOT EXISTS visual_template_versions_lifecycle_idx
  ON visual_template_versions (template_id, disabled_at, health_status);

COMMENT ON COLUMN visual_template_versions.health_status IS
  'Santé observée de la version : unknown, ok ou error (ADR-0103).';
COMMENT ON COLUMN visual_template_versions.disabled_at IS
  'Version retirée des choix catalogue ; les liens épinglés continuent de la résoudre (ADR-0103).';

-- Import interrompu avant l'indexation : la version n'a pas d'entrée asset.
UPDATE visual_template_versions v
   SET health_status = 'error',
       last_checked_at = now(),
       last_error_code = 'import_incomplete',
       last_error_message = 'Import incomplet : entrée ou assets absents',
       last_error_detail = jsonb_build_object('entry', v.entry)
 WHERE NOT EXISTS (
   SELECT 1
     FROM visual_template_assets a
    WHERE a.version_id = v.id
      AND a.path = v.entry
 );

ALTER TABLE visual_template_audit
  DROP CONSTRAINT IF EXISTS visual_template_audit_event_check;

ALTER TABLE visual_template_audit
  ADD CONSTRAINT visual_template_audit_event_check
  CHECK (event IN (
    'upload',
    'import_failed',
    'install',
    'uninstall',
    'platform_install',
    'platform_uninstall',
    'disable',
    'enable',
    'version_test_ok',
    'version_test_error',
    'version_disabled',
    'version_enabled',
    'version_rollback',
    'version_uninstalled'
  ));
