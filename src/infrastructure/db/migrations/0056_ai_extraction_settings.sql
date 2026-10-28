-- 0056_ai_extraction_settings.sql — modèle d'extraction et secours (ADR-0047).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE organization_ai_settings
  ADD COLUMN IF NOT EXISTS extraction_provider_id uuid,
  ADD COLUMN IF NOT EXISTS extraction_model text,
  ADD COLUMN IF NOT EXISTS extraction_fallback_provider_id uuid,
  ADD COLUMN IF NOT EXISTS extraction_fallback_model text;

ALTER TABLE organization_ai_settings
  ADD CONSTRAINT organization_ai_settings_extraction_provider_fk
    FOREIGN KEY (organization_id, extraction_provider_id)
    REFERENCES ai_providers (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT organization_ai_settings_extraction_fallback_provider_fk
    FOREIGN KEY (organization_id, extraction_fallback_provider_id)
    REFERENCES ai_providers (organization_id, id) ON DELETE RESTRICT;
