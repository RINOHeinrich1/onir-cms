-- 0034_categories.sql — catégories partagées et associations par type de contenu.
-- Décision ADR-0027 : clés de rattachement scalaires uniquement, jamais de tableau.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  label text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  actif boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_org_slug_idx
  ON categories (organization_id, lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS categories_org_label_idx
  ON categories (organization_id, lower(label));
CREATE INDEX IF NOT EXISTS categories_org_position_idx
  ON categories (organization_id, actif, position, label);

CREATE TABLE IF NOT EXISTS media_categories (
  media_id uuid NOT NULL REFERENCES medias (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, category_id)
);

CREATE INDEX IF NOT EXISTS media_categories_category_idx
  ON media_categories (category_id);

CREATE TABLE IF NOT EXISTS connaissance_categories (
  connaissance_id uuid NOT NULL REFERENCES base_connaissances (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connaissance_id, category_id)
);

CREATE INDEX IF NOT EXISTS connaissance_categories_category_idx
  ON connaissance_categories (category_id);

CREATE TABLE IF NOT EXISTS link_categories (
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, category_id)
);

CREATE INDEX IF NOT EXISTS link_categories_category_idx
  ON link_categories (category_id);

-- Exposition aux templates : uniquement des clés scalaires.
CREATE OR REPLACE VIEW template_read.v_categories
  WITH (security_barrier = true) AS
SELECT
  id,
  organization_id,
  label,
  slug,
  description,
  actif,
  position,
  created_at,
  updated_at
FROM categories
WHERE organization_id = current_setting('app.organization_id', true)::uuid;

CREATE OR REPLACE VIEW template_read.v_media_categories
  WITH (security_barrier = true) AS
SELECT
  mc.media_id,
  c.id AS category_id,
  c.label AS category_label,
  c.slug AS category_slug,
  c.position AS category_position,
  c.actif AS category_actif
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
  c.actif AS category_actif
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
  c.actif AS category_actif
FROM link_categories lc
JOIN categories c ON c.id = lc.category_id
JOIN chat_links l ON l.id = lc.link_id
WHERE l.organization_id = current_setting('app.organization_id', true)::uuid
  AND c.organization_id = current_setting('app.organization_id', true)::uuid;

COMMENT ON TABLE categories IS 'Taxonomie partagée par organisation (ADR-0027).';
COMMENT ON COLUMN categories.label IS 'Libellé affiché de la catégorie.';
COMMENT ON COLUMN categories.slug IS 'Identifiant stable lisible (URL, intégrations).';
COMMENT ON COLUMN categories.actif IS 'Catégorie proposée (true) ou archivée (false).';
COMMENT ON COLUMN categories.position IS 'Ordre d''affichage dans la taxonomie.';

COMMENT ON VIEW template_read.v_categories IS
  'Catégories de l''organisation, exposées aux templates.';
COMMENT ON VIEW template_read.v_media_categories IS
  'Association média ↔ catégorie (clé scalaire media_id pour les collections liées).';
COMMENT ON VIEW template_read.v_connaissance_categories IS
  'Association connaissance ↔ catégorie (clé scalaire connaissance_id).';
COMMENT ON VIEW template_read.v_link_categories IS
  'Association lien ↔ catégorie (clé scalaire link_id).';

COMMENT ON COLUMN template_read.v_media_categories.media_id IS 'Média parent (clé de rattachement).';
COMMENT ON COLUMN template_read.v_media_categories.category_id IS 'Catégorie associée.';
COMMENT ON COLUMN template_read.v_media_categories.category_label IS 'Libellé de la catégorie.';
COMMENT ON COLUMN template_read.v_connaissance_categories.connaissance_id IS 'Connaissance parente (clé de rattachement).';
COMMENT ON COLUMN template_read.v_link_categories.link_id IS 'Lien parent (clé de rattachement).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader') THEN
    EXECUTE 'GRANT SELECT ON template_read.v_categories TO template_reader';
    EXECUTE 'GRANT SELECT ON template_read.v_media_categories TO template_reader';
    EXECUTE 'GRANT SELECT ON template_read.v_connaissance_categories TO template_reader';
    EXECUTE 'GRANT SELECT ON template_read.v_link_categories TO template_reader';
  END IF;
END;
$$;
