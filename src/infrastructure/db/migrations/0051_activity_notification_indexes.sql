-- 0051_activity_notification_indexes.sql — polling des notifications dashboard.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE INDEX IF NOT EXISTS conversations_org_created_idx
  ON conversations (organization_id, created_at DESC, id DESC);
