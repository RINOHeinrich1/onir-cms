-- 0096_conversation_incident_fiche_submission.sql — erreur de soumission de fiche (ADR-0102).
-- Additif : permet de tracer une soumission de formulaire refusée sans la
-- confondre avec une erreur de génération finale.

ALTER TABLE conversation_incidents
  DROP CONSTRAINT IF EXISTS conversation_incidents_kind_check;

ALTER TABLE conversation_incidents
  ADD CONSTRAINT conversation_incidents_kind_check CHECK (
    kind IN (
      'ai_reply_failed',
      'fiche_generation_failed',
      'field_extraction_failed',
      'fiche_submission_failed'
    )
  );
