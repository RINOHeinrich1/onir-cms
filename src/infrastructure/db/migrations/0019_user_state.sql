-- 0019_user_state.sql — capacité cœur « état du visiteur » (ADR-0020)
-- Activation PAR LIEN de chat : flag booléen, désactivé par défaut (additif).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS user_state_enabled boolean NOT NULL DEFAULT false;
