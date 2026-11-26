-- 0101_visual_template_audit_ai_edit.sql — audit de l'édition assistée (ADR-0109).
-- Migration additive : aucun impact sur les événements existants.

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
    'version_uninstalled',
    'ai_edit'
  ));
