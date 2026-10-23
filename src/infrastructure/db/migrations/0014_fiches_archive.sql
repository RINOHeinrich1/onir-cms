-- 0014_fiches_archive.sql — archivage des fiches de prospection (US-FICHE-002)
-- Une fiche archivée est conservée mais masquée par défaut (filtre serveur).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE fiches ADD COLUMN IF NOT EXISTS archivee boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS fiches_archivee_idx ON fiches (archivee);
