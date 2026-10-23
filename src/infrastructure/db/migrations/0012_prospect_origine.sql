-- 0012_prospect_origine.sql — origine des prospects : saisie manuelle vs chat (US-PROSPECT-002)
-- `origine` : 'saisie' (créé à la main par un marketeur) ou 'libre' (issu d'un lien de chat).
-- `link_id`  : lien de chat d'entrée pour les prospects `libre` (traçabilité de la source).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'saisie';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS link_id uuid REFERENCES chat_links (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospects_origine_check') THEN
    ALTER TABLE prospects ADD CONSTRAINT prospects_origine_check CHECK (origine IN ('saisie', 'libre'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prospects_link_id_idx ON prospects (link_id);

-- Backfill : tout prospect sans auteur provient d'un chat (libre).
UPDATE prospects SET origine = 'libre' WHERE created_by IS NULL;

-- Backfill du lien d'entrée : le lien de la première fiche du prospect.
UPDATE prospects p
SET link_id = sub.link_id
FROM (
  SELECT f.prospect_id,
         cv.link_id,
         row_number() OVER (PARTITION BY f.prospect_id ORDER BY f.created_at) AS rn
  FROM fiches f
  JOIN conversations cv ON cv.id = f.conversation_id
  WHERE f.prospect_id IS NOT NULL AND f.conversation_id IS NOT NULL
) sub
WHERE p.id = sub.prospect_id AND sub.rn = 1 AND p.link_id IS NULL;
