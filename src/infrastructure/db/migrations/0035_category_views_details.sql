-- 0035_category_views_details.sql — vues d'association bidirectionnelles.
-- Chaque vue porte la clé scalaire du parent ET les colonnes utiles du contenu,
-- pour éviter d'ajouter une clé de catégorie au contenu (many-to-many).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

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
  m.actif AS media_actif
FROM media_categories mc
JOIN categories c ON c.id = mc.category_id
JOIN medias m ON m.id = mc.media_id
WHERE m.organization_id = current_setting('app.organization_id', true)::uuid
  AND c.organization_id = current_setting('app.organization_id', true)::uuid;

CREATE OR REPLACE VIEW template_read.v_connaissance_categories
  WITH (security_barrier = true) AS
SELECT
  cc.connaissance_id,
  c.id AS category_id,
  c.label AS category_label,
  c.slug AS category_slug,
  c.position AS category_position,
  c.actif AS category_actif,
  b.titre AS connaissance_titre,
  b.contenu AS connaissance_contenu,
  b.actif AS connaissance_actif
FROM connaissance_categories cc
JOIN categories c ON c.id = cc.category_id
JOIN base_connaissances b ON b.id = cc.connaissance_id
WHERE b.organization_id = current_setting('app.organization_id', true)::uuid
  AND c.organization_id = current_setting('app.organization_id', true)::uuid;

CREATE OR REPLACE VIEW template_read.v_link_categories
  WITH (security_barrier = true) AS
SELECT
  lc.link_id,
  c.id AS category_id,
  c.label AS category_label,
  c.slug AS category_slug,
  c.position AS category_position,
  c.actif AS category_actif,
  l.label AS link_label,
  l.type AS link_type,
  l.actif AS link_actif
FROM link_categories lc
JOIN categories c ON c.id = lc.category_id
JOIN chat_links l ON l.id = lc.link_id
WHERE l.organization_id = current_setting('app.organization_id', true)::uuid
  AND c.organization_id = current_setting('app.organization_id', true)::uuid;

COMMENT ON COLUMN template_read.v_media_categories.media_libelle IS 'Libellé du média (affichage).';
COMMENT ON COLUMN template_read.v_media_categories.media_type IS 'Type du média (photo, lien).';
COMMENT ON COLUMN template_read.v_media_categories.media_mime IS 'Type MIME du fichier média.';
COMMENT ON COLUMN template_read.v_media_categories.media_url IS 'URL du média (image ou lien).';
COMMENT ON COLUMN template_read.v_media_categories.media_actif IS 'Média actif ou non.';
COMMENT ON COLUMN template_read.v_connaissance_categories.connaissance_titre IS 'Titre de la connaissance.';
COMMENT ON COLUMN template_read.v_connaissance_categories.connaissance_contenu IS 'Contenu de la connaissance.';
COMMENT ON COLUMN template_read.v_connaissance_categories.connaissance_actif IS 'Connaissance active ou non.';
COMMENT ON COLUMN template_read.v_link_categories.link_label IS 'Libellé du lien de chat.';
COMMENT ON COLUMN template_read.v_link_categories.link_type IS 'Type du lien de chat.';
COMMENT ON COLUMN template_read.v_link_categories.link_actif IS 'Lien actif ou non.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader') THEN
    EXECUTE 'GRANT SELECT ON template_read.v_media_categories TO template_reader';
    EXECUTE 'GRANT SELECT ON template_read.v_connaissance_categories TO template_reader';
    EXECUTE 'GRANT SELECT ON template_read.v_link_categories TO template_reader';
  END IF;
END;
$$;
