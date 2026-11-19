-- 0094_webhook_event_outbox.sql — webhooks événementiels (ADR-0100).
-- Additif : les endpoints existants restent manuels tant qu'aucun trigger
-- automatique n'est déclaré. Les événements sont snapshotés à l'écriture.

CREATE TABLE IF NOT EXISTS webhook_endpoint_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  field_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_endpoint_triggers_event_check CHECK (
    event_type IN (
      'fiche.draft.all_fields_filled',
      'fiche.draft.field_filled',
      'fiche.draft.required_fields_filled',
      'fiche.validated'
    )
  ),
  CONSTRAINT webhook_endpoint_triggers_field_check CHECK (
    (event_type = 'fiche.draft.field_filled' AND field_key IS NOT NULL)
    OR (event_type <> 'fiche.draft.field_filled' AND field_key IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_endpoint_triggers_unique_idx
  ON webhook_endpoint_triggers (endpoint_id, event_type, COALESCE(field_key, ''));

CREATE INDEX IF NOT EXISTS webhook_endpoint_triggers_event_idx
  ON webhook_endpoint_triggers (event_type, field_key);

CREATE TABLE IF NOT EXISTS fiche_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'draft',
  chat_link_id uuid REFERENCES chat_links (id) ON DELETE SET NULL,
  config_id uuid REFERENCES chatbot_configs (id) ON DELETE SET NULL,
  fiche_key text NOT NULL,
  conversation_id uuid REFERENCES conversations (id) ON DELETE CASCADE,
  fiche_instance_id uuid REFERENCES conversation_fiche_instances (id) ON DELETE SET NULL,
  fiche_id uuid REFERENCES fiches (id) ON DELETE SET NULL,
  field_key text,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  error_message text,
  CONSTRAINT fiche_lifecycle_events_type_check CHECK (
    event_type IN (
      'fiche.draft.all_fields_filled',
      'fiche.draft.field_filled',
      'fiche.draft.required_fields_filled',
      'fiche.validated'
    )
  ),
  CONSTRAINT fiche_lifecycle_events_source_check CHECK (source IN ('draft', 'fiche')),
  CONSTRAINT fiche_lifecycle_events_status_check CHECK (
    status IN ('pending', 'dispatched', 'failed', 'payload_incomplete')
  )
);

CREATE INDEX IF NOT EXISTS fiche_lifecycle_events_pending_idx
  ON fiche_lifecycle_events (status, occurred_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fiche_lifecycle_events_conversation_idx
  ON fiche_lifecycle_events (organization_id, conversation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS fiche_lifecycle_events_instance_idx
  ON fiche_lifecycle_events (fiche_instance_id, event_type, occurred_at DESC);

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS fiche_event_id uuid
    REFERENCES fiche_lifecycle_events (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_deliveries_event_endpoint_uidx
  ON webhook_deliveries (endpoint_id, fiche_event_id)
  WHERE fiche_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_deliveries_event_idx
  ON webhook_deliveries (fiche_event_id)
  WHERE fiche_event_id IS NOT NULL;
