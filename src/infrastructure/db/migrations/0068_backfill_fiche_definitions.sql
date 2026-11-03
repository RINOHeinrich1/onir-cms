-- 0068_backfill_fiche_definitions.sql — backfill des définitions de fiches (ADR-0061).
-- Les fiches historiques portent template_key/template_version mais pas toujours
-- le snapshot `definition`. On copie la définition de la version de template
-- correspondante avant de retirer le rendu legacy (fallback chat_templates).
-- Idempotent : ne touche que les fiches dont `definition` est NULL.

UPDATE fiches f
SET definition = v.definition,
    updated_at = now()
FROM chat_templates t
JOIN chat_template_versions v ON v.template_id = t.id
WHERE f.definition IS NULL
  AND f.template_key IS NOT NULL
  AND f.template_version IS NOT NULL
  AND t.organization_id = f.organization_id
  AND t.key = f.template_key
  AND v.version = f.template_version;

DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing FROM fiches WHERE definition IS NULL;
  RAISE NOTICE 'Fiches sans définition après backfill : %', missing;
END $$;
