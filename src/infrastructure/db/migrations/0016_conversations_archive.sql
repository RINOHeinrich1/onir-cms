-- 0016_conversations_archive.sql — archivage des conversations (US-CONVERS-003)
-- Une conversation archivée est conservée mais masquée par défaut (filtre serveur).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archivee boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS conversations_archivee_idx ON conversations (archivee);
