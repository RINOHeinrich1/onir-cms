-- 0004_fiches.sql — fiches projet (US-FICHE-001, RM-FICHE-001/002)
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS fiches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations (id) ON DELETE SET NULL,
  prospect_id uuid REFERENCES prospects (id) ON DELETE SET NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  plateformes text[] NOT NULL DEFAULT '{}',
  budget text NOT NULL DEFAULT '',
  duree text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  statut text NOT NULL CHECK (statut IN ('initier', 'reprendre')),
  contraintes_techno text NOT NULL DEFAULT '',
  lien_doc_spec text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiches_prospect_id_idx ON fiches (prospect_id);
CREATE INDEX IF NOT EXISTS fiches_created_by_idx ON fiches (created_by);
