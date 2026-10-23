-- 0030_template_data_bindings_default.sql — bindings nommés et défaut par contrat
-- (ADR-0026 §3 : une surcharge de lien pointe un AUTRE binding de la même
-- organisation/version ; plusieurs bindings par contrat sont donc permis, avec
-- un seul binding par défaut.)

ALTER TABLE template_data_bindings
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT true;

DROP INDEX IF EXISTS template_data_bindings_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS template_data_bindings_default_uidx
  ON template_data_bindings (organization_id, template_version_id, contract_key)
  WHERE is_default;
