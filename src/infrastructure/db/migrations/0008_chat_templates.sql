-- 0008_chat_templates.sql — modèles de raisonnement versionnés (US-TEMPLATE-001)
-- `chat_templates` : métadonnées (key unique) ; `chat_template_versions` :
-- snapshots immuables de la définition (unicité template+version).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS chat_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES chat_templates (id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),
  definition jsonb NOT NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS chat_template_versions_template_id_idx
  ON chat_template_versions (template_id);
