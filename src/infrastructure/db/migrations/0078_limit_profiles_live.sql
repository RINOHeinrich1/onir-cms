-- 0078_limit_profiles_live.sql — profils de limites vivants (ADR-0066).
-- Renomme les offres en profils et ajoute le lien organisation → profil.
-- Aucun compteur de consommation n'est réinitialisé.

ALTER TABLE platform_offers RENAME TO limit_profiles;
ALTER TABLE organization_invitations RENAME COLUMN offer_id TO limit_profile_id;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS limit_profile_id uuid REFERENCES limit_profiles (id) ON DELETE SET NULL;

ALTER TABLE ai_provider_grants
  ADD COLUMN IF NOT EXISTS managed_by_profile_id uuid REFERENCES limit_profiles (id) ON DELETE SET NULL;
ALTER TABLE ai_model_grants
  ADD COLUMN IF NOT EXISTS managed_by_profile_id uuid REFERENCES limit_profiles (id) ON DELETE SET NULL;
ALTER TABLE ai_cluster_grants
  ADD COLUMN IF NOT EXISTS managed_by_profile_id uuid REFERENCES limit_profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_limit_profile_idx
  ON organizations (limit_profile_id)
  WHERE limit_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_provider_grants_profile_idx
  ON ai_provider_grants (managed_by_profile_id)
  WHERE managed_by_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_model_grants_profile_idx
  ON ai_model_grants (managed_by_profile_id)
  WHERE managed_by_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_cluster_grants_profile_idx
  ON ai_cluster_grants (managed_by_profile_id)
  WHERE managed_by_profile_id IS NOT NULL;
