-- ADR-0023 — variables paramétrables des templates visuels.
-- Sac de valeurs scalaires (string | number | boolean) renseigné par lien.
-- Objet opaque pour le cœur : aucune clé métier, aucune contrainte de forme.
ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS visual_template_params jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN chat_links.visual_template_params IS
  'Variables déclarées par le template visuel (schéma dans le manifeste de la version), valorisées par lien.';
