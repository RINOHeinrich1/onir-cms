-- 0099_preview_sessions.sql — sessions d'aperçu éphémères (ADR-0104)
-- Remplace les gros paramètres de template dans l'URL par un token court.

CREATE TABLE IF NOT EXISTS preview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('page', 'widget')),
  template_id uuid REFERENCES visual_templates (id) ON DELETE CASCADE,
  template_version text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((template_id IS NULL AND template_version IS NULL) OR (template_id IS NOT NULL AND template_version IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS preview_sessions_expires_idx ON preview_sessions (expires_at);
CREATE INDEX IF NOT EXISTS preview_sessions_link_idx ON preview_sessions (link_id, surface);
CREATE INDEX IF NOT EXISTS preview_sessions_user_idx ON preview_sessions (user_id, expires_at);

COMMENT ON TABLE preview_sessions IS
  'État éphémère de l’aperçu studio ; le token clair reste dans l’URL de l’iframe.';
