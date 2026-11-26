-- 0107_template_edit_audit_planning.sql — audit du planner et des clarifications (ADR-0111).
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
    'proposal_created',
    'proposal_rejected',
    'proposal_applied',
    'link_saved',
    'ambiguous',
    'not_found',
    'error'
  ));
