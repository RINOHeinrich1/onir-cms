-- 0022_tenant_columns_expand.sql — colonnes organization_id (expand, ADR-0025)
-- Ajout additif et nullable : l'ancien process peut continuer à écrire sans
-- organization_id pendant le déploiement. Le backfill et l'enforce suivent.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE fiches ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE chat_templates ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE base_connaissances ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE medias ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE confidentialites ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS prospects_org_expand_idx ON prospects (organization_id);
CREATE INDEX IF NOT EXISTS chat_links_org_expand_idx ON chat_links (organization_id);
CREATE INDEX IF NOT EXISTS conversations_org_expand_idx ON conversations (organization_id);
CREATE INDEX IF NOT EXISTS fiches_org_expand_idx ON fiches (organization_id);
CREATE INDEX IF NOT EXISTS chat_templates_org_expand_idx ON chat_templates (organization_id);
CREATE INDEX IF NOT EXISTS base_connaissances_org_expand_idx ON base_connaissances (organization_id);
CREATE INDEX IF NOT EXISTS medias_org_expand_idx ON medias (organization_id);
CREATE INDEX IF NOT EXISTS confidentialites_org_expand_idx ON confidentialites (organization_id);
