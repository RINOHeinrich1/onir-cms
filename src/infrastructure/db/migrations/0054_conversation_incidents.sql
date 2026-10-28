-- 0054_conversation_incidents.sql — erreurs IA/fiche à traiter par un humain (ADR-0046).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS conversation_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ai_reply_failed', 'fiche_generation_failed', 'field_extraction_failed')),
  severity text NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_incidents_open_idx
  ON conversation_incidents (conversation_id, kind)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS conversation_incidents_org_idx
  ON conversation_incidents (organization_id, status, last_seen_at DESC);
