-- 0067_webhooks_fiches_collecte.sql — webhooks sur fiches de collecte (ADR-0061).
-- Le scope « modèle de raisonnement » (template_key) devient nullable et reste
-- supporté pour les endpoints historiques. Un endpoint peut désormais être
-- rattaché à un chatbot (chat_links) et, optionnellement, à une fiche de
-- collecte (fiche_key). Le payload est alors construit depuis le snapshot
-- `fiches.definition`.
-- Migration immuable : toute évolution passe par 0068+.

ALTER TABLE webhook_endpoints
  ALTER COLUMN template_key DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS chat_link_id uuid REFERENCES chat_links (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fiche_key text;

ALTER TABLE webhook_deliveries
  ALTER COLUMN template_key DROP NOT NULL,
  ALTER COLUMN template_version DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS chat_link_id uuid REFERENCES chat_links (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fiche_key text;

-- Un endpoint a exactement un périmètre : soit un modèle legacy, soit un
-- chatbot (avec une fiche de collecte optionnelle).
ALTER TABLE webhook_endpoints
  ADD CONSTRAINT webhook_endpoints_scope_check CHECK (
    (template_key IS NOT NULL AND chat_link_id IS NULL AND fiche_key IS NULL)
    OR (template_key IS NULL AND chat_link_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS webhook_endpoints_org_chat_link_idx
  ON webhook_endpoints (organization_id, chat_link_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS webhook_deliveries_org_chat_link_idx
  ON webhook_deliveries (organization_id, chat_link_id, created_at DESC);
