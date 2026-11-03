-- 0069_drop_legacy_templates.sql — suppression du stack « modèles de raisonnement ».
-- Les fiches de collecte vivent désormais dans `chatbot_configs.fiche_definitions`
-- et chaque fiche conserve son snapshot `fiches.definition` (0064/0068).
-- Les templates visuels (`visual_templates`) ne sont PAS concernés.
-- Migration destructive et idempotente (IF EXISTS) : les objets legacy sont
-- retirés, les données conservées (fiches, configs, conversations, prospects,
-- connaissances, médias, templates visuels).

-- 1) Périmètre webhook legacy : la contrainte référence `template_key`.
ALTER TABLE webhook_endpoints
  DROP CONSTRAINT IF EXISTS webhook_endpoints_scope_check;

DROP INDEX IF EXISTS webhook_endpoints_org_template_idx;

-- Les endpoints actifs sans chatbot ne peuvent plus fonctionner (plus de
-- modèle de raisonnement) : ils sont soft-deleted avant le nouveau scope.
UPDATE webhook_endpoints
   SET deleted_at = COALESCE(deleted_at, now()), enabled = false, updated_at = now()
 WHERE chat_link_id IS NULL
   AND deleted_at IS NULL;

ALTER TABLE webhook_endpoints
  DROP COLUMN IF EXISTS template_key;

ALTER TABLE webhook_deliveries
  DROP COLUMN IF EXISTS template_key,
  DROP COLUMN IF EXISTS template_version;

-- Nouveau scope : un endpoint actif cible obligatoirement un chatbot ; les
-- endpoints legacy soft-deleted sont conservés pour l'historique.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_scope_check'
  ) THEN
    ALTER TABLE webhook_endpoints
      ADD CONSTRAINT webhook_endpoints_scope_check CHECK (
        chat_link_id IS NOT NULL OR deleted_at IS NOT NULL
      );
  END IF;
END $$;

-- 2) Colonnes legacy des liens et des fiches (déjà remplacées par
--    `current_config_id` et `definition`).
ALTER TABLE chat_links
  DROP COLUMN IF EXISTS template_key,
  DROP COLUMN IF EXISTS template_version;

ALTER TABLE fiches
  DROP COLUMN IF EXISTS template_key,
  DROP COLUMN IF EXISTS template_version;

-- 3) Vues de lecture des fournisseurs SQL : la colonne `template_keys` est
--    remplacée par la portée `chat_link_ids` (les vues dépendent des colonnes).
DROP VIEW IF EXISTS template_read.v_connaissances;
DROP VIEW IF EXISTS template_read.v_medias;

CREATE VIEW template_read.v_connaissances
  WITH (security_barrier = true) AS
SELECT
  id,
  organization_id,
  titre,
  contenu,
  chat_link_ids,
  actif,
  created_at,
  updated_at
FROM base_connaissances
WHERE organization_id = current_setting('app.organization_id', true)::uuid;

CREATE VIEW template_read.v_medias
  WITH (security_barrier = true) AS
SELECT
  id,
  organization_id,
  type,
  libelle,
  chat_link_ids,
  actif,
  mime,
  url,
  created_at,
  updated_at
FROM medias
WHERE organization_id = current_setting('app.organization_id', true)::uuid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader') THEN
    EXECUTE 'GRANT SELECT ON template_read.v_connaissances TO template_reader';
    EXECUTE 'GRANT SELECT ON template_read.v_medias TO template_reader';
  END IF;
END $$;

COMMENT ON VIEW template_read.v_connaissances IS
  'Contenus de connaissance (livres, articles) de l''organisation, exposés aux templates.';
COMMENT ON COLUMN template_read.v_connaissances.id IS 'Identifiant unique du contenu.';
COMMENT ON COLUMN template_read.v_connaissances.organization_id IS 'Organisation propriétaire (filtrage automatique).';
COMMENT ON COLUMN template_read.v_connaissances.titre IS 'Titre affiché du contenu.';
COMMENT ON COLUMN template_read.v_connaissances.contenu IS 'Texte ou description du contenu.';
COMMENT ON COLUMN template_read.v_connaissances.chat_link_ids IS 'Chatbots auxquels le contenu est rattaché (vide = global).';
COMMENT ON COLUMN template_read.v_connaissances.actif IS 'Contenu visible (true) ou masqué (false).';
COMMENT ON COLUMN template_read.v_connaissances.created_at IS 'Date de création.';
COMMENT ON COLUMN template_read.v_connaissances.updated_at IS 'Date de dernière modification.';

COMMENT ON VIEW template_read.v_medias IS
  'Fichiers médias (images, PDF, vidéos) de l''organisation, exposés aux templates.';
COMMENT ON COLUMN template_read.v_medias.id IS 'Identifiant unique du média.';
COMMENT ON COLUMN template_read.v_medias.organization_id IS 'Organisation propriétaire (filtrage automatique).';
COMMENT ON COLUMN template_read.v_medias.type IS 'Type de média (image, pdf, video…).';
COMMENT ON COLUMN template_read.v_medias.libelle IS 'Libellé lisible du média.';
COMMENT ON COLUMN template_read.v_medias.chat_link_ids IS 'Chatbots auxquels le média est rattaché (vide = global).';
COMMENT ON COLUMN template_read.v_medias.actif IS 'Média visible (true) ou masqué (false).';
COMMENT ON COLUMN template_read.v_medias.mime IS 'Type MIME du fichier.';
COMMENT ON COLUMN template_read.v_medias.url IS 'Chemin ou URL du fichier.';
COMMENT ON COLUMN template_read.v_medias.created_at IS 'Date de création.';
COMMENT ON COLUMN template_read.v_medias.updated_at IS 'Date de dernière modification.';

-- Reprise des requêtes SQL enregistrées : la vue template_read expose désormais
-- `chat_link_ids` (plus de `template_keys`).
UPDATE template_data_bindings
SET query_text = replace(query_text, 'template_keys', 'chat_link_ids')
WHERE query_text LIKE '%template_keys%';

-- Provenance/portée legacy des connaissances et des médias.
DROP INDEX IF EXISTS base_connaissances_ai_source_idx;
DROP INDEX IF EXISTS idx_connaissances_template_keys;
DROP INDEX IF EXISTS idx_medias_template_keys;

ALTER TABLE base_connaissances
  DROP COLUMN IF EXISTS template_keys,
  DROP COLUMN IF EXISTS source_template_key,
  DROP COLUMN IF EXISTS ai_generation_id;

ALTER TABLE medias
  DROP COLUMN IF EXISTS template_keys;

-- 4) État IA des brouillons de chatbot.
ALTER TABLE chatbot_drafts
  DROP COLUMN IF EXISTS ai_sources;

UPDATE chatbot_drafts
   SET state = state - 'aiSources' - 'stagedKnowledge';

-- 5) Tables du stack « modèles de raisonnement » (ordre FK correct).
DROP TABLE IF EXISTS template_ai_generations;
DROP TABLE IF EXISTS chat_template_versions;
DROP TABLE IF EXISTS chat_templates;
