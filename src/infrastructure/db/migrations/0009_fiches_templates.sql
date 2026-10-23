-- 0009_fiches_templates.sql — rattachement liens/fiches aux modèles (décision 4)
-- `template_key`/`template_version` figent le snapshot utilisé (reproductibilité).
-- `fiches.data` porte les valeurs génériques (clés = field.name) ; `fiches.statut`
-- devient nullable (modèles sans statut). Backfill : `data` dérivé des colonnes
-- historiques, snapshot `fiche-projet` v1 pour toutes les lignes existantes.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'fiche-projet';
ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS template_version int NOT NULL DEFAULT 1;

ALTER TABLE fiches ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'fiche-projet';
ALTER TABLE fiches ADD COLUMN IF NOT EXISTS template_version int NOT NULL DEFAULT 1;
ALTER TABLE fiches ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE fiches ALTER COLUMN statut DROP NOT NULL;

UPDATE fiches
SET data = jsonb_build_object(
  'plateformes', COALESCE(plateformes, '{}'),
  'description', COALESCE(description, ''),
  'budget', COALESCE(budget, ''),
  'duree', COALESCE(duree, ''),
  'contact', COALESCE(contact, ''),
  'statut', statut,
  'contraintesTechno', COALESCE(contraintes_techno, ''),
  'lienDocSpec', COALESCE(lien_doc_spec, '')
)
WHERE data = '{}';
