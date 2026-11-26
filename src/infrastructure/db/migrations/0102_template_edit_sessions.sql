-- 0102_template_edit_sessions.sql — sessions serveur du chat d'édition (ADR-0109).
CREATE TABLE IF NOT EXISTS template_edit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  surface text NOT NULL CHECK (surface IN ('page', 'widget')),
  template_id uuid REFERENCES visual_templates (id) ON DELETE SET NULL,
  template_version text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_edit_sessions_org_link_idx
  ON template_edit_sessions (organization_id, link_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS template_edit_sessions_active_user_idx
  ON template_edit_sessions (organization_id, link_id, surface, created_by)
  WHERE status = 'active';

COMMENT ON TABLE template_edit_sessions IS
  'Sessions serveur du chat d’édition assistée des templates (ADR-0109).';
