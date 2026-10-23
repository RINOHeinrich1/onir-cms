-- 0017_confidentialites.sql — politiques de confidentialité & consentement (US-CONFID-001)
-- Un lien de chat peut être rattaché à UNE politique de confidentialité ; le
-- consentement du visiteur est horodaté sur la conversation.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS confidentialites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  texte text NOT NULL,
  lien text NOT NULL DEFAULT '',
  actif boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS confidentialites_titre_idx ON confidentialites (lower(titre));

-- Politique par défaut (id fixe pour le rattachement initial des liens existants).
INSERT INTO confidentialites (id, titre, texte, lien)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Politique de confidentialité',
  'J''accepte que mes informations soient enregistrées et traitées par l''éditeur de cette instance afin de traiter ma demande, conformément à la politique de confidentialité.',
  '/confidentialite'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS confidentialite_id uuid
  REFERENCES confidentialites (id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS consentement_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confidentialite_id uuid
  REFERENCES confidentialites (id) ON DELETE SET NULL;

-- Rattachement par défaut : les liens existants adoptent la politique par défaut.
UPDATE chat_links SET confidentialite_id = '00000000-0000-0000-0000-000000000001'
WHERE confidentialite_id IS NULL;
