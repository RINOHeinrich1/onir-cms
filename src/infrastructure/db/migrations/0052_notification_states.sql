-- 0052_notification_states.sql — filigrane de lecture des notifications (ADR-0044).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS notification_states (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
