-- 0024_tenant_columns_enforce.sql — NOT NULL, FK et DEFAULT legacy (ADR-0025)
-- Le DEFAULT legacy est conservé VOLONTAIREMENT le temps du déploiement :
-- l'ancien process continue d'insérer sans organization_id pendant le build.
-- Le retrait des DEFAULT (contract) est différé à 0026 (hors release).

ALTER TABLE prospects ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE chat_links ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE fiches ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE chat_templates ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE base_connaissances ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE medias ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE confidentialites ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE prospects ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';
ALTER TABLE chat_links ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';
ALTER TABLE conversations ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';
ALTER TABLE fiches ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';
ALTER TABLE chat_templates ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';
ALTER TABLE base_connaissances ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';
ALTER TABLE medias ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';
ALTER TABLE confidentialites ALTER COLUMN organization_id
  SET DEFAULT '00000000-0000-0000-0000-000000000025';

ALTER TABLE prospects
  ADD CONSTRAINT prospects_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
ALTER TABLE conversations
  ADD CONSTRAINT conversations_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
ALTER TABLE fiches
  ADD CONSTRAINT fiches_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
ALTER TABLE chat_templates
  ADD CONSTRAINT chat_templates_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
ALTER TABLE base_connaissances
  ADD CONSTRAINT base_connaissances_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
ALTER TABLE medias
  ADD CONSTRAINT medias_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
ALTER TABLE confidentialites
  ADD CONSTRAINT confidentialites_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id);
