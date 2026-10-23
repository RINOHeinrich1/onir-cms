-- 0002_prospects.sql — table prospects (US-PROSPECT-001, RM-PROSPECT-001)
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  prenom text NOT NULL DEFAULT '',
  nature text NOT NULL CHECK (nature IN ('physique', 'morale')),
  email text NOT NULL,
  activite text NOT NULL DEFAULT '',
  fonction text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospects_email_idx ON prospects (lower(email));
CREATE INDEX IF NOT EXISTS prospects_created_by_idx ON prospects (created_by);
