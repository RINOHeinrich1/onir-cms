-- 0103_template_edit_audit_events.sql — audit append-only des sessions d'édition IA (ADR-0109).
CREATE TABLE IF NOT EXISTS template_edit_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES template_edit_sessions (id) ON DELETE CASCADE,
  message_id text,
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN (
    'session_started',
    'session_resumed',
    'user_message',
    'assistant_message',
    'proposal_created',
    'proposal_applied',
    'link_saved',
    'ambiguous',
    'not_found'
  )),
  template_id uuid REFERENCES visual_templates (id) ON DELETE SET NULL,
  template_version text,
  candidate_id text,
  content text,
  operations jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  before_hash text,
  after_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_edit_audit_events_session_idx
  ON template_edit_audit_events (organization_id, link_id, session_id, created_at ASC);

COMMENT ON TABLE template_edit_audit_events IS
  'Journal append-only des demandes, propositions et applications d’édition IA (ADR-0109).';
