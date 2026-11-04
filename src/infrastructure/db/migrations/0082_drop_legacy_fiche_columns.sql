-- 0082_drop_legacy_fiche_columns.sql — ADR-0067 §3 (destructif, irréversible).
--
-- Suppression des 8 colonnes legacy de `fiches` :
--   plateformes, description, budget, duree, contact, statut,
--   contraintes_techno, lien_doc_spec
--
-- Ordre strict :
--   1. backfill de `fiches.data` depuis les colonnes legacy si la clé manque
--      ou vaut JSON null (aucune conversion de type, `data` reste prioritaire) ;
--   2. retrait du champ historique `statut` (`initier`/`reprendre`) de
--      `fiches.data`, des snapshots `fiches.definition`, de
--      `chatbot_configs.fiche_definitions`, `fiche_collectes.fields` et
--      `fiche_collecte_versions.fields` (champ + tout `requiredIf.field`) ;
--   3. suppression des 8 colonnes.
--
-- Idempotence : toutes les étapes sont conditionnelles (`IF EXISTS`,
-- `IF NOT EXISTS` sémantiques, `DROP COLUMN IF EXISTS`) ; rejouer la migration
-- ne modifie plus rien et ne casse pas.
--
-- Atomicité : le runner (`migrate.ts`) exécute chaque fichier dans une
-- transaction unique (BEGIN … COMMIT). Le fichier ne contient donc pas de
-- BEGIN/COMMIT imbriqué. Ne PAS l'exécuter sur une base réelle sans sauvegarde
-- vérifiée (voir docs/migration-0067-nettoyage-legacy.md).

-- ---------------------------------------------------------------------------
-- 1) Backfill `fiches.data` depuis les colonnes legacy (clé absente/nulle).
--    Les colonnes peuvent déjà être absentes lors d'un rejeu : SQL dynamique
--    protégé par une vérification de `information_schema.columns`.
-- ---------------------------------------------------------------------------
DO $backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fiches'
       AND column_name = 'plateformes'
  ) THEN
    EXECUTE $sql$
      UPDATE fiches
         SET data = jsonb_set(
               data,
               '{plateformes}',
               to_jsonb(COALESCE(plateformes, '{}'::text[])),
               true
             )
       WHERE jsonb_typeof(data) = 'object'
         AND (data->'plateformes' IS NULL OR data->'plateformes' = 'null'::jsonb)
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fiches'
       AND column_name = 'description'
  ) THEN
    EXECUTE $sql$
      UPDATE fiches
         SET data = jsonb_set(
               data,
               '{description}',
               to_jsonb(COALESCE(description, '')),
               true
             )
       WHERE jsonb_typeof(data) = 'object'
         AND (data->'description' IS NULL OR data->'description' = 'null'::jsonb)
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fiches'
       AND column_name = 'budget'
  ) THEN
    EXECUTE $sql$
      UPDATE fiches
         SET data = jsonb_set(
               data,
               '{budget}',
               to_jsonb(COALESCE(budget, '')),
               true
             )
       WHERE jsonb_typeof(data) = 'object'
         AND (data->'budget' IS NULL OR data->'budget' = 'null'::jsonb)
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fiches'
       AND column_name = 'duree'
  ) THEN
    EXECUTE $sql$
      UPDATE fiches
         SET data = jsonb_set(
               data,
               '{duree}',
               to_jsonb(COALESCE(duree, '')),
               true
             )
       WHERE jsonb_typeof(data) = 'object'
         AND (data->'duree' IS NULL OR data->'duree' = 'null'::jsonb)
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fiches'
       AND column_name = 'contact'
  ) THEN
    EXECUTE $sql$
      UPDATE fiches
         SET data = jsonb_set(
               data,
               '{contact}',
               to_jsonb(COALESCE(contact, '')),
               true
             )
       WHERE jsonb_typeof(data) = 'object'
         AND (data->'contact' IS NULL OR data->'contact' = 'null'::jsonb)
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fiches'
       AND column_name = 'contraintes_techno'
  ) THEN
    EXECUTE $sql$
      UPDATE fiches
         SET data = jsonb_set(
               data,
               '{contraintesTechno}',
               to_jsonb(COALESCE(contraintes_techno, '')),
               true
             )
       WHERE jsonb_typeof(data) = 'object'
         AND (data->'contraintesTechno' IS NULL OR data->'contraintesTechno' = 'null'::jsonb)
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fiches'
       AND column_name = 'lien_doc_spec'
  ) THEN
    EXECUTE $sql$
      UPDATE fiches
         SET data = jsonb_set(
               data,
               '{lienDocSpec}',
               to_jsonb(COALESCE(lien_doc_spec, '')),
               true
             )
       WHERE jsonb_typeof(data) = 'object'
         AND (data->'lienDocSpec' IS NULL OR data->'lienDocSpec' = 'null'::jsonb)
    $sql$;
  END IF;
END
$backfill$;

-- ---------------------------------------------------------------------------
-- 2) Retrait du champ historique `statut` (et de tout `requiredIf` vers
--    `statut`) des données et des snapshots de définition.
-- ---------------------------------------------------------------------------

-- 2a. `fiches.data` : le statut historique n'est jamais conservé.
UPDATE fiches
   SET data = data - 'statut'
 WHERE jsonb_typeof(data) = 'object'
   AND data ? 'statut';

-- 2b. `fiches.definition` (objet avec `fields`).
UPDATE fiches
   SET definition = jsonb_set(
         definition,
         '{fields}',
         COALESCE(
           (
             SELECT jsonb_agg(
                      CASE
                        WHEN jsonb_typeof(field) = 'object'
                         AND field->'requiredIf'->>'field' = 'statut'
                        THEN field - 'requiredIf'
                        ELSE field
                      END
                    )
               FROM jsonb_array_elements(definition->'fields') AS field
              WHERE NOT (
                jsonb_typeof(field) = 'object'
                AND field->>'name' = 'statut'
              )
           ),
           '[]'::jsonb
         )
       )
 WHERE definition IS NOT NULL
   AND jsonb_typeof(definition) = 'object'
   AND jsonb_typeof(definition->'fields') = 'array'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements(definition->'fields') AS field
      WHERE jsonb_typeof(field) = 'object'
        AND (
          field->>'name' = 'statut'
          OR field->'requiredIf'->>'field' = 'statut'
        )
   );

-- 2c. `chatbot_configs.fiche_definitions` (tableau de définitions).
UPDATE chatbot_configs
   SET fiche_definitions = COALESCE(
         (
           SELECT jsonb_agg(
                    CASE
                      WHEN jsonb_typeof(def) = 'object'
                       AND jsonb_typeof(def->'fields') = 'array'
                      THEN jsonb_set(
                             def,
                             '{fields}',
                             COALESCE(
                               (
                                 SELECT jsonb_agg(
                                          CASE
                                            WHEN jsonb_typeof(field) = 'object'
                                             AND field->'requiredIf'->>'field' = 'statut'
                                            THEN field - 'requiredIf'
                                            ELSE field
                                          END
                                        )
                                   FROM jsonb_array_elements(def->'fields') AS field
                                  WHERE NOT (
                                    jsonb_typeof(field) = 'object'
                                    AND field->>'name' = 'statut'
                                  )
                               ),
                               '[]'::jsonb
                             )
                      )
                      ELSE def
                    END
                  )
             FROM jsonb_array_elements(chatbot_configs.fiche_definitions) AS def
         ),
         '[]'::jsonb
       )
 WHERE jsonb_typeof(fiche_definitions) = 'array'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements(chatbot_configs.fiche_definitions) AS def
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(def->'fields') = 'array' THEN def->'fields'
          ELSE '[]'::jsonb
        END
      ) AS field
      WHERE jsonb_typeof(field) = 'object'
        AND (
          field->>'name' = 'statut'
          OR field->'requiredIf'->>'field' = 'statut'
        )
   );

-- 2d. `fiche_collectes.fields` (tableau de champs).
UPDATE fiche_collectes
   SET fields = COALESCE(
         (
           SELECT jsonb_agg(
                    CASE
                      WHEN jsonb_typeof(field) = 'object'
                       AND field->'requiredIf'->>'field' = 'statut'
                      THEN field - 'requiredIf'
                      ELSE field
                    END
                  )
             FROM jsonb_array_elements(fields) AS field
            WHERE NOT (
              jsonb_typeof(field) = 'object'
              AND field->>'name' = 'statut'
            )
         ),
         '[]'::jsonb
       )
 WHERE jsonb_typeof(fields) = 'array'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements(fields) AS field
      WHERE jsonb_typeof(field) = 'object'
        AND (
          field->>'name' = 'statut'
          OR field->'requiredIf'->>'field' = 'statut'
        )
   );

-- 2e. `fiche_collecte_versions.fields` (versions immuables : nettoyage du
--     résidu legacy uniquement, aucune autre donnée touchée).
UPDATE fiche_collecte_versions
   SET fields = COALESCE(
         (
           SELECT jsonb_agg(
                    CASE
                      WHEN jsonb_typeof(field) = 'object'
                       AND field->'requiredIf'->>'field' = 'statut'
                      THEN field - 'requiredIf'
                      ELSE field
                    END
                  )
             FROM jsonb_array_elements(fields) AS field
            WHERE NOT (
              jsonb_typeof(field) = 'object'
              AND field->>'name' = 'statut'
            )
         ),
         '[]'::jsonb
       )
 WHERE jsonb_typeof(fields) = 'array'
   AND EXISTS (
     SELECT 1
       FROM jsonb_array_elements(fields) AS field
      WHERE jsonb_typeof(field) = 'object'
        AND (
          field->>'name' = 'statut'
          OR field->'requiredIf'->>'field' = 'statut'
        )
   );

-- ---------------------------------------------------------------------------
-- 3) Suppression des 8 colonnes legacy (dernière étape, irréversible).
-- ---------------------------------------------------------------------------
ALTER TABLE fiches
  DROP COLUMN IF EXISTS plateformes,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS budget,
  DROP COLUMN IF EXISTS duree,
  DROP COLUMN IF EXISTS contact,
  DROP COLUMN IF EXISTS statut,
  DROP COLUMN IF EXISTS contraintes_techno,
  DROP COLUMN IF EXISTS lien_doc_spec;
