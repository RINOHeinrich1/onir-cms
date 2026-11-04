-- 0074_ai_shared_catalog_grants.sql — partage du catalogue IA entre organisations (ADR-0065).
-- Les ressources restent détenues par leur organisation d'origine ; les grants
-- autorisent une autre organisation à les utiliser au runtime. Aucun secret
-- n'est copié, aucun compteur n'est modifié.

CREATE TABLE IF NOT EXISTS ai_provider_grants (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES ai_providers (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider_id)
);

CREATE INDEX IF NOT EXISTS ai_provider_grants_provider_idx
  ON ai_provider_grants (provider_id, organization_id);

CREATE TABLE IF NOT EXISTS ai_model_grants (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES ai_providers (id) ON DELETE CASCADE,
  model_id text NOT NULL,
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider_id, model_id),
  CONSTRAINT ai_model_grants_model_nonempty CHECK (btrim(model_id) <> '')
);

CREATE INDEX IF NOT EXISTS ai_model_grants_provider_model_idx
  ON ai_model_grants (provider_id, model_id, organization_id);

CREATE TABLE IF NOT EXISTS ai_cluster_grants (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  cluster_id uuid NOT NULL REFERENCES ai_clusters (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS ai_cluster_grants_cluster_idx
  ON ai_cluster_grants (cluster_id, organization_id);

-- Les FK composites d'origine empêchaient toute référence inter-organisations.
-- Elles sont remplacées par des FK simples ; l'accès est contrôlé par les grants
-- dans les dépôts et les cas d'usage.
DO $$
DECLARE
  target_table text;
  constraint_name text;
BEGIN
  FOR target_table, constraint_name IN
    SELECT c.conrelid::regclass::text, c.conname
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.conrelid::regclass::text IN (
         'chat_links',
         'ai_provider_models',
         'ai_cluster_members',
         'organization_ai_settings',
         'organization_ai_usage_defaults',
         'chat_link_ai_usage_overrides'
       )
       AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES ai_providers%'
       AND pg_get_constraintdef(c.oid) LIKE '%organization_id%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target_table, constraint_name);
  END LOOP;
END $$;

ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_ai_provider_fk
  FOREIGN KEY (ai_provider_id) REFERENCES ai_providers (id) ON DELETE RESTRICT;

ALTER TABLE ai_provider_models
  ADD CONSTRAINT ai_provider_models_provider_fk
  FOREIGN KEY (provider_id) REFERENCES ai_providers (id) ON DELETE CASCADE;

ALTER TABLE ai_cluster_members
  ADD CONSTRAINT ai_cluster_members_provider_fk
  FOREIGN KEY (provider_id) REFERENCES ai_providers (id) ON DELETE CASCADE;

ALTER TABLE organization_ai_settings
  ADD CONSTRAINT organization_ai_settings_provider_fk
  FOREIGN KEY (default_provider_id) REFERENCES ai_providers (id) ON DELETE RESTRICT;

ALTER TABLE organization_ai_usage_defaults
  ADD CONSTRAINT organization_ai_usage_defaults_provider_fk
  FOREIGN KEY (provider_id) REFERENCES ai_providers (id) ON DELETE CASCADE;

ALTER TABLE chat_link_ai_usage_overrides
  ADD CONSTRAINT chat_link_ai_usage_overrides_provider_fk
  FOREIGN KEY (provider_id) REFERENCES ai_providers (id) ON DELETE CASCADE;

COMMENT ON TABLE ai_provider_grants IS
  'Fournisseurs IA partagés à une organisation bénéficiaire (ADR-0065).';
COMMENT ON TABLE ai_model_grants IS
  'Modèles IA partagés individuellement à une organisation bénéficiaire (ADR-0065).';
COMMENT ON TABLE ai_cluster_grants IS
  'Clusters IA partagés à une organisation bénéficiaire (ADR-0065).';

-- Fonctions d'accès utilisées par les triggers de cohérence inter-organisations.
CREATE OR REPLACE FUNCTION ai_provider_accessible(target_organization_id uuid, target_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM ai_providers p
       WHERE p.id = target_provider_id AND p.organization_id = target_organization_id
    )
    OR EXISTS (
      SELECT 1 FROM ai_provider_grants g
       WHERE g.organization_id = target_organization_id
         AND g.provider_id = target_provider_id
    )
    OR EXISTS (
      SELECT 1 FROM ai_model_grants g
       WHERE g.organization_id = target_organization_id
         AND g.provider_id = target_provider_id
    )
    OR EXISTS (
      SELECT 1
        FROM ai_cluster_grants cg
        JOIN ai_cluster_members cm ON cm.cluster_id = cg.cluster_id
       WHERE cg.organization_id = target_organization_id
         AND cm.provider_id = target_provider_id
    );
$$;

CREATE OR REPLACE FUNCTION ai_model_accessible(
  target_organization_id uuid,
  target_provider_id uuid,
  target_model text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM ai_providers p
       WHERE p.id = target_provider_id AND p.organization_id = target_organization_id
    )
    OR EXISTS (
      SELECT 1 FROM ai_provider_grants g
       WHERE g.organization_id = target_organization_id
         AND g.provider_id = target_provider_id
    )
    OR EXISTS (
      SELECT 1 FROM ai_model_grants g
       WHERE g.organization_id = target_organization_id
         AND g.provider_id = target_provider_id
         AND g.model_id = target_model
    )
    OR EXISTS (
      SELECT 1
        FROM ai_cluster_grants cg
        JOIN ai_cluster_members cm ON cm.cluster_id = cg.cluster_id
       WHERE cg.organization_id = target_organization_id
         AND cm.provider_id = target_provider_id
         AND cm.model = target_model
    );
$$;

CREATE OR REPLACE FUNCTION enforce_ai_provider_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ai_provider_id IS NOT NULL
     AND NOT ai_provider_accessible(NEW.organization_id, NEW.ai_provider_id) THEN
    RAISE EXCEPTION 'ai_provider_access_denied' USING ERRCODE = '23503';
  END IF;
  IF NEW.ai_provider_id IS NOT NULL
     AND NEW.ai_model IS NOT NULL
     AND NOT ai_model_accessible(NEW.organization_id, NEW.ai_provider_id, NEW.ai_model) THEN
    RAISE EXCEPTION 'ai_model_access_denied' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_ai_settings_provider_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.default_provider_id IS NOT NULL
     AND NOT ai_provider_accessible(NEW.organization_id, NEW.default_provider_id) THEN
    RAISE EXCEPTION 'ai_provider_access_denied' USING ERRCODE = '23503';
  END IF;
  IF NEW.default_provider_id IS NOT NULL
     AND NEW.default_model IS NOT NULL
     AND NOT ai_model_accessible(NEW.organization_id, NEW.default_provider_id, NEW.default_model) THEN
    RAISE EXCEPTION 'ai_model_access_denied' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_ai_default_provider_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider_id IS NOT NULL
     AND NOT ai_provider_accessible(NEW.organization_id, NEW.provider_id) THEN
    RAISE EXCEPTION 'ai_provider_access_denied' USING ERRCODE = '23503';
  END IF;
  IF NEW.provider_id IS NOT NULL
     AND NEW.model IS NOT NULL
     AND NOT ai_model_accessible(NEW.organization_id, NEW.provider_id, NEW.model) THEN
    RAISE EXCEPTION 'ai_model_access_denied' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_ai_cluster_member_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT ai_provider_accessible(NEW.organization_id, NEW.provider_id) THEN
    RAISE EXCEPTION 'ai_provider_access_denied' USING ERRCODE = '23503';
  END IF;
  IF NOT ai_model_accessible(NEW.organization_id, NEW.provider_id, NEW.model) THEN
    RAISE EXCEPTION 'ai_model_access_denied' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_ai_model_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ai_providers p
     WHERE p.id = NEW.provider_id AND p.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'ai_model_owner_mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_links_ai_access_trg ON chat_links;
CREATE TRIGGER chat_links_ai_access_trg
  BEFORE INSERT OR UPDATE OF organization_id, ai_provider_id, ai_model ON chat_links
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_provider_access();

DROP TRIGGER IF EXISTS organization_ai_settings_access_trg ON organization_ai_settings;
CREATE TRIGGER organization_ai_settings_access_trg
  BEFORE INSERT OR UPDATE OF organization_id, default_provider_id, default_model
  ON organization_ai_settings
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_settings_provider_access();

DROP TRIGGER IF EXISTS organization_ai_usage_defaults_access_trg ON organization_ai_usage_defaults;
CREATE TRIGGER organization_ai_usage_defaults_access_trg
  BEFORE INSERT OR UPDATE OF organization_id, provider_id, model
  ON organization_ai_usage_defaults
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_default_provider_access();

DROP TRIGGER IF EXISTS chat_link_ai_usage_overrides_access_trg ON chat_link_ai_usage_overrides;
CREATE TRIGGER chat_link_ai_usage_overrides_access_trg
  BEFORE INSERT OR UPDATE OF organization_id, provider_id, model
  ON chat_link_ai_usage_overrides
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_default_provider_access();

DROP TRIGGER IF EXISTS ai_cluster_members_access_trg ON ai_cluster_members;
CREATE TRIGGER ai_cluster_members_access_trg
  BEFORE INSERT OR UPDATE OF organization_id, provider_id, model ON ai_cluster_members
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_cluster_member_access();

DROP TRIGGER IF EXISTS ai_provider_models_owner_trg ON ai_provider_models;
CREATE TRIGGER ai_provider_models_owner_trg
  BEFORE INSERT OR UPDATE OF organization_id, provider_id ON ai_provider_models
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_model_owner();
