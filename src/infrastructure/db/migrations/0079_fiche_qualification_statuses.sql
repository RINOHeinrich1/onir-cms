-- 0079_fiche_qualification_statuses.sql — ADR-0067.
-- Statuts de qualification versionnés avec les fiches de collecte ; aucune
-- reprise des fiches existantes (qualification_status_key NULL).

ALTER TABLE fiche_collectes
  ADD COLUMN IF NOT EXISTS statuses jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE fiche_collecte_versions
  ADD COLUMN IF NOT EXISTS statuses jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fiche_collectes_statuses_array'
  ) THEN
    ALTER TABLE fiche_collectes
      ADD CONSTRAINT fiche_collectes_statuses_array
      CHECK (jsonb_typeof(statuses) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fiche_collecte_versions_statuses_array'
  ) THEN
    ALTER TABLE fiche_collecte_versions
      ADD CONSTRAINT fiche_collecte_versions_statuses_array
      CHECK (jsonb_typeof(statuses) = 'array');
  END IF;
END $$;

ALTER TABLE fiches
  ADD COLUMN IF NOT EXISTS qualification_status_key text,
  ADD COLUMN IF NOT EXISTS qualification_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualification_status_updated_by uuid
    REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fiches_qualification_status_idx
  ON fiches (organization_id, qualification_status_key);
