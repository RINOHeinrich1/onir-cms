-- 0018_visual_templates.sql — templates visuels (packages UI-only, ADR-0019)
-- Un template = manifeste + assets ; versions IMMUABLES ; un lien de chat
-- épingle une version (snapshot) + une config de thème.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS visual_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS visual_templates_key_idx ON visual_templates (lower(key));

CREATE TABLE IF NOT EXISTS visual_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES visual_templates (id) ON DELETE CASCADE,
  version text NOT NULL,
  host_protocol text NOT NULL,
  trust_level text NOT NULL,
  mode text NOT NULL,
  manifest jsonb NOT NULL,
  entry text NOT NULL,
  integrity text NOT NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS visual_template_versions_uidx
  ON visual_template_versions (template_id, version);

CREATE TABLE IF NOT EXISTS visual_template_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES visual_template_versions (id) ON DELETE CASCADE,
  path text NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  size integer NOT NULL,
  mime text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS visual_template_assets_uidx
  ON visual_template_assets (version_id, path);

-- Application à un lien de chat : 1 lien → 1 template (version figée) + config.
ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS visual_template_id uuid
  REFERENCES visual_templates (id) ON DELETE SET NULL;
ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS visual_template_version text;
ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS visual_template_config jsonb NOT NULL DEFAULT '{}';
