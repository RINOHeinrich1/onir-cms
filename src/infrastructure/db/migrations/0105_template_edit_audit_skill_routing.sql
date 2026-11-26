-- 0105_template_edit_audit_skill_routing.sql — trace le routage des skills (ADR-0110).
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
    'proposal_created',
    'proposal_applied',
    'link_saved',
    'ambiguous',
    'not_found',
    'error'
  ));
