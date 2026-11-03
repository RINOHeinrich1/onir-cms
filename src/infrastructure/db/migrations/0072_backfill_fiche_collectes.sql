-- 0072_backfill_fiche_collectes.sql — publie les fiches déjà présentes dans les chatbots.
-- Les doublons identiques (même clé dans plusieurs configurations) sont ignorés ;
-- les nouvelles fiches de chatbot seront publiées automatiquement par l'application.

INSERT INTO fiche_collectes
  (organization_id, key, label, description, intent, fields, render_template,
   instructions, version, created_by)
SELECT
  c.organization_id,
  f->>'key',
  COALESCE(f->>'label', f->>'key'),
  COALESCE(f->>'description', ''),
  COALESCE(f->>'intent', ''),
  COALESCE(f->'fields', '[]'::jsonb),
  COALESCE(f->>'renderTemplate', ''),
  COALESCE(f->>'instructions', ''),
  1,
  c.created_by
FROM chatbot_configs c
CROSS JOIN LATERAL jsonb_array_elements(c.fiche_definitions) f
WHERE jsonb_typeof(c.fiche_definitions) = 'array'
  AND NULLIF(f->>'key', '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM fiche_collectes fc
     WHERE fc.organization_id = c.organization_id
       AND fc.key = f->>'key'
  )
ON CONFLICT (organization_id, key) DO NOTHING;
