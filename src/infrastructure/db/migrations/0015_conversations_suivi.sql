-- 0015_conversations_suivi.sql — suivi des conversations (US-CONVERS-001)
-- `statut`       : 'en_cours' (défaut) ou 'finalisee' (fiche générée).
-- `prospect_id`  : prospect rattaché (créé dès l'identification pour un lien standard).
-- `last_message_at` : horodatage du dernier message (durée d'inactivité).
-- `updated_at`   : dernière activité (message, statut…).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'en_cours';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES prospects (id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_statut_check') THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_statut_check
      CHECK (statut IN ('en_cours', 'finalisee'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversations_prospect_id_idx ON conversations (prospect_id);
CREATE INDEX IF NOT EXISTS conversations_statut_idx ON conversations (statut);
CREATE INDEX IF NOT EXISTS conversations_link_visitor_idx ON conversations (link_id, lower(visitor_email));

-- Backfill : statut finalisee là où une fiche existe.
UPDATE conversations cv SET statut = 'finalisee'
WHERE EXISTS (SELECT 1 FROM fiches f WHERE f.conversation_id = cv.id);

-- Backfill prospect_id : prospect du lien (spécifique).
UPDATE conversations cv SET prospect_id = l.prospect_id
FROM chat_links l
WHERE l.id = cv.link_id AND l.prospect_id IS NOT NULL AND cv.prospect_id IS NULL;

-- Backfill prospect_id : prospect de la fiche (standard finalisé).
UPDATE conversations cv SET prospect_id = f.prospect_id
FROM fiches f
WHERE f.conversation_id = cv.id AND f.prospect_id IS NOT NULL AND cv.prospect_id IS NULL;

-- Backfill last_message_at.
UPDATE conversations cv SET last_message_at = agg.last
FROM (
  SELECT conversation_id, max(created_at) AS last
  FROM chat_messages GROUP BY conversation_id
) agg
WHERE cv.id = agg.conversation_id AND cv.last_message_at IS NULL;
