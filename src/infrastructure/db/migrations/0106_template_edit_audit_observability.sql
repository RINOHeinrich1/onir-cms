-- 0106_template_edit_audit_observability.sql — audit détaillé des étapes IA (ADR-0109).
ALTER TABLE template_edit_audit_events
  ADD COLUMN IF NOT EXISTS turn_id text,
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS raw_response jsonb,
  ADD COLUMN IF NOT EXISTS validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE template_edit_audit_events
  DROP CONSTRAINT IF EXISTS template_edit_audit_events_event_check;

ALTER TABLE template_edit_audit_events
  ADD CONSTRAINT template_edit_audit_events_event_check
  CHECK (event IN (
    'session_started',
    'session_resumed',
    'user_message',
    'assistant_message',
    'skill_routing',
    'target_candidates',
    'proposal_created',
    'proposal_rejected',
    'proposal_applied',
    'link_saved',
    'ambiguous',
    'not_found',
    'error'
  ));

CREATE INDEX IF NOT EXISTS template_edit_audit_events_turn_idx
  ON template_edit_audit_events (organization_id, link_id, session_id, turn_id);
