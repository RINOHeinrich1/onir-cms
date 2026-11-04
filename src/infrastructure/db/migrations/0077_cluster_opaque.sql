-- 0077_cluster_opaque.sql — un grant cluster ne donne plus accès aux modèles membres.
-- Les modèles membres restent utilisables via le runtime du cluster, mais ne sont
-- visibles/sélectionnables directement que s'ils sont partagés explicitement.

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
    );
$$;

CREATE OR REPLACE FUNCTION ai_cluster_accessible(
  target_organization_id uuid,
  target_cluster_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM ai_clusters c
       WHERE c.id = target_cluster_id AND c.organization_id = target_organization_id
    )
    OR EXISTS (
      SELECT 1 FROM ai_cluster_grants g
       WHERE g.organization_id = target_organization_id
         AND g.cluster_id = target_cluster_id
    );
$$;

CREATE OR REPLACE FUNCTION enforce_ai_default_provider_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.target_kind = 'cluster' AND NEW.cluster_id IS NOT NULL THEN
    IF NOT ai_cluster_accessible(NEW.organization_id, NEW.cluster_id) THEN
      RAISE EXCEPTION 'ai_cluster_access_denied' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  END IF;
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
