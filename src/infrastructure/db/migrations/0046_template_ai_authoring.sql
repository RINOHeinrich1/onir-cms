-- 0046_template_ai_authoring.sql — provenance des connaissances générées par
-- l'assistance IA des modèles de raisonnement (ADR-0038).
-- `template_keys` reste la portée métier (visibilité par modèle) ; les
-- colonnes ajoutées portent la provenance, afin de pouvoir remplacer uniquement
-- les connaissances IA d'un modèle sans toucher aux connaissances manuelles.
-- Migration immuable : toute évolution passe par 0047+.

ALTER TABLE base_connaissances
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_template_key text,
  ADD COLUMN IF NOT EXISTS ai_generation_id uuid;

ALTER TABLE base_connaissances
  DROP CONSTRAINT IF EXISTS base_connaissances_origin_check;

ALTER TABLE base_connaissances
  ADD CONSTRAINT base_connaissances_origin_check
  CHECK (origin IN ('manual', 'ai'));

CREATE INDEX IF NOT EXISTS base_connaissances_ai_source_idx
  ON base_connaissances (organization_id, source_template_key, origin)
  WHERE origin = 'ai';

COMMENT ON COLUMN base_connaissances.origin IS
  'Provenance de l''entrée : saisie manuelle ou générée par l''assistance IA.';
COMMENT ON COLUMN base_connaissances.source_template_key IS
  'Modèle de raisonnement à l''origine d''une entrée IA (provenance, pas portée).';
COMMENT ON COLUMN base_connaissances.ai_generation_id IS
  'Identifiant de la génération IA ayant produit l''entrée.';
