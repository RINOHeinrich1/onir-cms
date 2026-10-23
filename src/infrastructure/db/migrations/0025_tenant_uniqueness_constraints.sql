-- 0025_tenant_uniqueness_constraints.sql — unicités locales et FK composites
-- ADR-0025 §5/§9 : les unicités métier deviennent locales à l'organisation ;
-- les relations critiques sont protégées physiquement par des FK composites.
-- Les unicités globales ont été retirées en 0023 (nécessaire au clonage).

DROP INDEX IF EXISTS base_connaissances_titre_idx;
DROP INDEX IF EXISTS medias_type_libelle_idx;
DROP INDEX IF EXISTS confidentialites_titre_idx;
ALTER TABLE chat_templates DROP CONSTRAINT IF EXISTS chat_templates_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS base_connaissances_org_titre_idx
  ON base_connaissances (organization_id, lower(titre));

CREATE UNIQUE INDEX IF NOT EXISTS medias_org_type_libelle_idx
  ON medias (organization_id, type, lower(libelle));

CREATE UNIQUE INDEX IF NOT EXISTS confidentialites_org_titre_idx
  ON confidentialites (organization_id, lower(titre));

CREATE UNIQUE INDEX IF NOT EXISTS chat_templates_org_key_idx
  ON chat_templates (organization_id, lower(key));

-- Cibles des FK composites.
ALTER TABLE prospects
  ADD CONSTRAINT prospects_org_id_uidx UNIQUE (organization_id, id);
ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_org_id_uidx UNIQUE (organization_id, id);
ALTER TABLE conversations
  ADD CONSTRAINT conversations_org_id_uidx UNIQUE (organization_id, id);

-- FK composites (relations critiques).
ALTER TABLE conversations
  ADD CONSTRAINT conversations_org_link_fk
  FOREIGN KEY (organization_id, link_id) REFERENCES chat_links (organization_id, id);
ALTER TABLE fiches
  ADD CONSTRAINT fiches_org_conversation_fk
  FOREIGN KEY (organization_id, conversation_id) REFERENCES conversations (organization_id, id);
ALTER TABLE fiches
  ADD CONSTRAINT fiches_org_prospect_fk
  FOREIGN KEY (organization_id, prospect_id) REFERENCES prospects (organization_id, id);
ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_org_prospect_fk
  FOREIGN KEY (organization_id, prospect_id) REFERENCES prospects (organization_id, id);

-- Index de listes par organisation.
CREATE INDEX IF NOT EXISTS prospects_org_created_idx ON prospects (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_links_org_created_idx ON chat_links (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_org_activity_idx
  ON conversations (organization_id, coalesce(last_message_at, created_at) DESC);
CREATE INDEX IF NOT EXISTS fiches_org_created_idx ON fiches (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS medias_org_updated_idx ON medias (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS connaissances_org_updated_idx
  ON base_connaissances (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS confidentialites_org_list_idx
  ON confidentialites (organization_id, lower(titre));
CREATE INDEX IF NOT EXISTS chat_templates_org_label_idx ON chat_templates (organization_id, label);
