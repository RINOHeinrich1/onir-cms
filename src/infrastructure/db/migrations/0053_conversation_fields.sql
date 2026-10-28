-- 0053_conversation_fields.sql — état live des champs collectés (ADR-0045).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS conversation_field_values (
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  field_name text NOT NULL,
  value jsonb,
  source text NOT NULL CHECK (source IN ('ai', 'manual', 'visitor', 'system')),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, field_name)
);

CREATE INDEX IF NOT EXISTS conversation_field_values_org_idx
  ON conversation_field_values (organization_id, conversation_id);

CREATE TABLE IF NOT EXISTS conversation_field_analyses (
  conversation_id uuid PRIMARY KEY REFERENCES conversations (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  last_analyzed_message_at timestamptz,
  last_analyzed_at timestamptz,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'ok', 'error')),
  error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_field_analyses_org_idx
  ON conversation_field_analyses (organization_id, updated_at DESC);
