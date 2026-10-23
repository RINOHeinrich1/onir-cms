-- 0011_base_connaissances.sql — base de connaissances du mini-RAG (US-CONNAISS-001)
-- `titre` unique (insensible à la casse, le LLM référence par titre exact) ;
-- `template_key` NULL = toutes les conversations, sinon restreint au modèle.
-- Seed : exemple « contact de l'entreprise ». Idempotent.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS base_connaissances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  contenu text NOT NULL DEFAULT '',
  template_key text,
  actif boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS base_connaissances_titre_idx ON base_connaissances (lower(titre));
CREATE INDEX IF NOT EXISTS base_connaissances_template_idx ON base_connaissances (template_key) WHERE actif;

INSERT INTO base_connaissances (titre, contenu, template_key)
VALUES (
  'contact de l''entreprise',
  'contact@example.com',
  NULL
)
ON CONFLICT (lower(titre)) DO NOTHING;
