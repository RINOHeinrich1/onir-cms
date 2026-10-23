-- 0029_template_data_bindings.sql — ressources de données des templates (ADR-0026)
-- Bindings par organisation + version de template, surcharge par lien, audit.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS template_data_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  template_version_id uuid NOT NULL REFERENCES visual_template_versions (id) ON DELETE CASCADE,
  contract_key text NOT NULL CHECK (contract_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  provider text NOT NULL DEFAULT 'sql' CHECK (provider IN ('sql')),
  query_text text NOT NULL,
  root_path text NOT NULL,
  root_key text NOT NULL DEFAULT 'id',
  children jsonb NOT NULL DEFAULT '[]'::jsonb,
  query_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  invalidate_on text NOT NULL DEFAULT 'none'
    CHECK (invalidate_on IN ('none', 'medias', 'connaissances', 'prospects')),
  cache_ttl_seconds integer NOT NULL DEFAULT 300
    CHECK (cache_ttl_seconds BETWEEN 0 AND 3600),
  max_rows integer NOT NULL DEFAULT 200 CHECK (max_rows BETWEEN 1 AND 1000),
  enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_data_bindings_children_array CHECK (jsonb_typeof(children) = 'array'),
  CONSTRAINT template_data_bindings_inputs_array CHECK (jsonb_typeof(query_inputs) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS template_data_bindings_uidx
  ON template_data_bindings (organization_id, template_version_id, contract_key);

-- Surcharge par lien : pointe un binding existant (aucun SQL ad hoc dans le lien).
CREATE TABLE IF NOT EXISTS chat_link_data_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  contract_key text NOT NULL CHECK (contract_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  binding_id uuid NOT NULL REFERENCES template_data_bindings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_link_data_bindings_uidx
  ON chat_link_data_bindings (chat_link_id, contract_key);

-- Cohérence organisation + version : le lien et son binding doivent viser la
-- même organisation et la même version de template.
CREATE OR REPLACE FUNCTION template_link_binding_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  link_org uuid;
  link_template uuid;
  binding_org uuid;
  binding_version uuid;
  version_template uuid;
BEGIN
  SELECT organization_id, visual_template_id
    INTO link_org, link_template
    FROM chat_links WHERE id = NEW.chat_link_id;
  SELECT organization_id, template_version_id
    INTO binding_org, binding_version
    FROM template_data_bindings WHERE id = NEW.binding_id;
  IF link_org IS NULL OR binding_org IS NULL OR link_org <> binding_org THEN
    RAISE EXCEPTION 'binding de données hors organisation';
  END IF;
  SELECT template_id INTO version_template
    FROM visual_template_versions WHERE id = binding_version;
  IF link_template IS NOT NULL AND version_template IS DISTINCT FROM link_template THEN
    RAISE EXCEPTION 'binding de données d''une autre version de template';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS template_link_binding_guard_trg ON chat_link_data_bindings;
CREATE TRIGGER template_link_binding_guard_trg
  BEFORE INSERT OR UPDATE ON chat_link_data_bindings
  FOR EACH ROW EXECUTE FUNCTION template_link_binding_guard();

-- Audit : aucune donnée métier, aucun SQL, aucun paramètre.
CREATE TABLE IF NOT EXISTS template_data_audit (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL,
  chat_link_id uuid,
  template_version_id uuid,
  contract_key text NOT NULL,
  binding_id uuid,
  cache_hit boolean NOT NULL DEFAULT false,
  duration_ms integer NOT NULL,
  row_count integer,
  byte_count integer,
  outcome text NOT NULL CHECK (outcome IN ('ok', 'error', 'timeout', 'invalid')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_data_audit_org_created_idx
  ON template_data_audit (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Schéma de lecture des fournisseurs SQL : vues org-scopées uniquement.
-- `current_setting(..., true)` absent ⇒ NULL ⇒ aucune ligne (fail-closed).
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS template_read;

CREATE OR REPLACE VIEW template_read.v_connaissances
  WITH (security_barrier = true) AS
SELECT
  id,
  organization_id,
  titre,
  contenu,
  template_keys,
  actif,
  created_at,
  updated_at
FROM base_connaissances
WHERE organization_id = current_setting('app.organization_id', true)::uuid;

CREATE OR REPLACE VIEW template_read.v_medias
  WITH (security_barrier = true) AS
SELECT
  id,
  organization_id,
  type,
  libelle,
  template_keys,
  actif,
  mime,
  url,
  created_at,
  updated_at
FROM medias
WHERE organization_id = current_setting('app.organization_id', true)::uuid;

-- Rôle lecture seule : créé seulement si le rôle de migration en a le droit
-- (sinon provisionnement explicite via scripts/provision-template-reader.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader') THEN
    CREATE ROLE template_reader NOLOGIN;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'template_reader non créé (privilèges insuffisants)';
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA template_read TO template_reader';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA template_read TO template_reader';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA template_read GRANT SELECT ON TABLES TO template_reader';
  END IF;
END;
$$;
