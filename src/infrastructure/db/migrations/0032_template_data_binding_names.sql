-- 0032_template_data_binding_names.sql — variantes de sources (ADR-0026 §3)
-- Un binding porte un nom lisible ; le défaut garde « Défaut ». Plusieurs
-- bindings (variantes) peuvent viser le même contrat, sélectionnables par lien.

ALTER TABLE template_data_bindings
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Défaut'
  CHECK (char_length(name) BETWEEN 1 AND 60);

CREATE UNIQUE INDEX IF NOT EXISTS template_data_bindings_name_uidx
  ON template_data_bindings (organization_id, template_version_id, contract_key, lower(name));
