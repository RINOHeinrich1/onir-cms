-- 0095_webhook_delivery_runtime_context.sql — contexte IA des exécutions webhook (ADR-0102).
-- Additif : relie une livraison à la conversation et à l'instance de fiche qui
-- l'ont déclenchée, pour construire un contexte runtime borné.

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS conversation_id uuid
    REFERENCES conversations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fiche_instance_id uuid
    REFERENCES conversation_fiche_instances (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS webhook_deliveries_conversation_created_idx
  ON webhook_deliveries (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_deliveries_instance_event_idx
  ON webhook_deliveries (fiche_instance_id, event_type, created_at DESC)
  WHERE fiche_instance_id IS NOT NULL;
