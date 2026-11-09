-- 0085_template_param_assets.sql — assets d'images des paramètres de template.
--
-- Les paramètres de template ne stockent jamais le binaire : ils stockent une
-- URL stable vers un asset. Le fichier reste dans le stockage média (S3/disque).

CREATE TABLE IF NOT EXISTS template_param_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_param_assets_org_idx
  ON template_param_assets (organization_id, created_at DESC);
