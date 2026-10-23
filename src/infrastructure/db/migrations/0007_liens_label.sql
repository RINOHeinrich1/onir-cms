-- 0007_liens_label.sql — libellé des liens + édition globale (US-LIENS-001)
-- `label` : nom lisible donné par l'équipe (ex. « Salon IT », « Stand »).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
