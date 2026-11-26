-- 0108_template_edit_audit_noop.sql — trace les demandes déjà satisfaites.
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
    'clarification_required',
    'noop',
    'proposal_created',
    'proposal_rejected',
    'proposal_applied',
    'link_saved',
    'ambiguous',
    'not_found',
    'error'
  ));
