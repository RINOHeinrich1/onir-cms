-- 0070_notification_alert_reads.sql — filigrane de lecture des alertes d'incidents.
-- Migration additive : les alertes restent ouvertes, seul leur état « lu » est mémorisé.

ALTER TABLE notification_states
  ADD COLUMN IF NOT EXISTS alerts_read_at timestamptz;
