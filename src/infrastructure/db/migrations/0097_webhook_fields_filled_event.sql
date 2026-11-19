-- 0097_webhook_fields_filled_event.sql — événement ET sur un groupe de champs (ADR-0100/0101).
-- Additif : conserve field_filled (un champ, OU) et ajoute fields_filled
-- (plusieurs champs, ET).

ALTER TABLE webhook_endpoint_triggers
  ADD COLUMN IF NOT EXISTS field_keys text[];
ALTER TABLE webhook_endpoint_triggers
  ADD COLUMN IF NOT EXISTS group_key text;

UPDATE webhook_endpoint_triggers
   SET group_key = array_to_string(field_keys, ',')
 WHERE field_keys IS NOT NULL AND group_key IS NULL;

ALTER TABLE webhook_endpoint_triggers
  DROP CONSTRAINT IF EXISTS webhook_endpoint_triggers_event_check;
ALTER TABLE webhook_endpoint_triggers
  ADD CONSTRAINT webhook_endpoint_triggers_event_check CHECK (
    event_type IN (
      'fiche.draft.all_fields_filled',
      'fiche.draft.field_filled',
      'fiche.draft.fields_filled',
      'fiche.draft.required_fields_filled',
      'fiche.validated'
    )
  );

ALTER TABLE webhook_endpoint_triggers
  DROP CONSTRAINT IF EXISTS webhook_endpoint_triggers_field_check;
ALTER TABLE webhook_endpoint_triggers
  ADD CONSTRAINT webhook_endpoint_triggers_field_check CHECK (
    (event_type = 'fiche.draft.field_filled' AND field_key IS NOT NULL AND field_keys IS NULL)
    OR (event_type = 'fiche.draft.fields_filled' AND field_key IS NULL AND field_keys IS NOT NULL AND cardinality(field_keys) > 0)
    OR (event_type NOT IN ('fiche.draft.field_filled', 'fiche.draft.fields_filled') AND field_key IS NULL AND field_keys IS NULL)
  );

DROP INDEX IF EXISTS webhook_endpoint_triggers_unique_idx;
CREATE UNIQUE INDEX webhook_endpoint_triggers_unique_idx
  ON webhook_endpoint_triggers (
    endpoint_id,
    event_type,
    COALESCE(field_key, ''),
    COALESCE(group_key, '')
  );

ALTER TABLE fiche_lifecycle_events
  ADD COLUMN IF NOT EXISTS field_keys text[];

ALTER TABLE fiche_lifecycle_events
  DROP CONSTRAINT IF EXISTS fiche_lifecycle_events_type_check;
ALTER TABLE fiche_lifecycle_events
  ADD CONSTRAINT fiche_lifecycle_events_type_check CHECK (
    event_type IN (
      'fiche.draft.all_fields_filled',
      'fiche.draft.field_filled',
      'fiche.draft.fields_filled',
      'fiche.draft.required_fields_filled',
      'fiche.validated'
    )
  );
