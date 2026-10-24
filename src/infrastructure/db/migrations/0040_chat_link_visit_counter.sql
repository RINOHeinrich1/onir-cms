-- 0040_chat_link_visit_counter.sql — compteur d'ouvertures des liens publics.
-- Comptage agrégé uniquement : aucune IP, aucun cookie, aucune donnée personnelle.
-- Migration immuable : toute évolution passe par 0041+.

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS visit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visit_at timestamptz;

ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_visit_count_check CHECK (visit_count >= 0);

COMMENT ON COLUMN chat_links.visit_count IS
  'Nombre d''ouvertures publiques comptées (hors robots connus et aperçu admin).';
COMMENT ON COLUMN chat_links.last_visit_at IS
  'Date de la dernière ouverture publique comptée ; NULL si aucune visite.';
