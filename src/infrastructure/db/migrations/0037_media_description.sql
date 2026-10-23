-- 0037_media_description.sql — description longue des médias (photos et liens).
-- Le libellé reste la description COURTE (référencée par l'IA, unicité par type).
-- Cette colonne porte la discussion / description longue, sans toucher au libellé.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE medias
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

COMMENT ON COLUMN medias.libelle IS 'Libellé court (référence IA, unicité par type).';
COMMENT ON COLUMN medias.description IS 'Description longue / discussion libre du média.';

-- Catalogue lisible par les templates : ajout en fin de vue pour rester compatible.
CREATE OR REPLACE VIEW template_read.v_medias
  WITH (security_barrier = true) AS
SELECT
  id,
  organization_id,
  type,
  libelle,
  template_keys,
  actif,
  mime,
  url,
  created_at,
  updated_at,
  description
FROM medias
WHERE organization_id = current_setting('app.organization_id', true)::uuid;

CREATE OR REPLACE VIEW template_read.v_media_categories
  WITH (security_barrier = true) AS
SELECT
  mc.media_id,
  c.id AS category_id,
  c.label AS category_label,
  c.slug AS category_slug,
  c.position AS category_position,
  c.actif AS category_actif,
  m.libelle AS media_libelle,
  m.type AS media_type,
  m.mime AS media_mime,
  m.url AS media_url,
  m.actif AS media_actif,
  m.description AS media_description
FROM media_categories mc
JOIN categories c ON c.id = mc.category_id
JOIN medias m ON m.id = mc.media_id
WHERE m.organization_id = current_setting('app.organization_id', true)::uuid
  AND c.organization_id = current_setting('app.organization_id', true)::uuid;

COMMENT ON COLUMN template_read.v_medias.description IS
  'Description longue / discussion libre du média (le libellé reste court).';
COMMENT ON COLUMN template_read.v_media_categories.media_description IS
  'Description longue / discussion libre du média (le libellé reste court).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader') THEN
    EXECUTE 'GRANT SELECT ON template_read.v_medias TO template_reader';
    EXECUTE 'GRANT SELECT ON template_read.v_media_categories TO template_reader';
  END IF;
END;
$$;
