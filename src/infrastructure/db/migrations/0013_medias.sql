-- 0013_medias.sql — médiathèque (photothèque + liens) et enrichissement du chat (US-MEDIA-001)
-- Même principe que la base de connaissances : libellé unique (référencé par l'IA),
-- portée globale (template_key NULL) ou par modèle, actif/inactif.
-- `photo` : le fichier est stocké hors base (clé `fichier` + `mime`).
-- `lien`  : une URL externe (`url`).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS medias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('photo', 'lien')),
  libelle text NOT NULL,
  template_key text,
  actif boolean NOT NULL DEFAULT true,
  fichier text,
  mime text,
  url text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medias_contenu_check CHECK (
    (type = 'photo' AND fichier IS NOT NULL) OR (type = 'lien' AND url IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS medias_type_libelle_idx ON medias (type, lower(libelle));
CREATE INDEX IF NOT EXISTS medias_template_key_idx ON medias (template_key);

-- Sources recherchées lors de la génération de réponse (cases à cocher par lien).
ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL
  DEFAULT '{"connaissances": true, "phototheque": true, "lien": true}';

-- Médias proposés par l'assistant. NULL = non encore calculé (idempotence) ;
-- '[]' = calculé, rien de pertinent ; sinon liste de médias.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS medias jsonb;
