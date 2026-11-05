-- 0083_chatbot_missions_information_sources.sql — ADR-0068.
--
-- Ajoute la mission stable et les sources d'information versionnées au
-- chatbot. Les colonnes legacy `search_tool` et `data_selection` sont
-- conservées pour compatibilité et rollback ; le runtime lit les nouvelles
-- colonnes lorsqu'elles sont présentes.
--
-- Backfill sans perte :
--   - search_tool        -> information_sources.fiches
--   - data_selection     -> information_sources.connaissances / medias
--   - chat_links.sources -> activation des sources B/C
--   - mission            -> collect / inform / hybrid selon les capacités
--
-- Une configuration sans fiche de collecte et sans source exploitable reste
-- sans mission : elle continue d'utiliser le chemin legacy.

ALTER TABLE chatbot_configs
  ADD COLUMN IF NOT EXISTS mission text,
  ADD COLUMN IF NOT EXISTS information_sources jsonb;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'chatbot_configs'::regclass
       AND conname = 'chatbot_configs_mission_check'
  ) THEN
    ALTER TABLE chatbot_configs
      ADD CONSTRAINT chatbot_configs_mission_check
      CHECK (mission IS NULL OR mission IN ('collect', 'inform', 'hybrid'));
  END IF;
END
$migration$;

WITH source_flags AS (
  SELECT
    c.id,
    c.fiche_definitions,
    c.search_tool,
    c.data_selection,
    COALESCE((l.sources->>'connaissances')::boolean, true) AS connaissances,
    COALESCE((l.sources->>'phototheque')::boolean, true) AS phototheque,
    COALESCE((l.sources->>'lien')::boolean, true) AS liens,
    COALESCE((c.search_tool->>'enabled')::boolean, false)
      AND jsonb_array_length(COALESCE(c.search_tool->'ficheTypes', '[]'::jsonb)) > 0
      AS recherche_active
  FROM chatbot_configs c
  JOIN chat_links l ON l.id = c.chat_link_id
)
UPDATE chatbot_configs c
   SET information_sources = jsonb_build_object(
         'fiches', jsonb_build_object(
           'enabled', f.recherche_active,
           'label', 'Fiches existantes',
           'usageHint', 'Rechercher des fiches existantes et leurs informations.',
           'ficheTypes', COALESCE(f.search_tool->'ficheTypes', '[]'::jsonb),
           'statusMode', COALESCE(f.search_tool->>'statusMode', 'hidden_fixed'),
           'fixedStatusKeys', COALESCE(f.search_tool->'fixedStatusKeys', '[]'::jsonb),
           'sortMode', COALESCE(f.search_tool->>'sortMode', 'fair_rotation'),
           'matchMode', 'strict'
         ),
         'connaissances', jsonb_build_object(
           'enabled', f.connaissances,
           'label', 'Connaissances',
           'usageHint', 'Utiliser la base de connaissances pour répondre aux questions.',
           'selection', jsonb_build_object(
             'mode', COALESCE(f.data_selection->>'mode', 'all'),
             'ids', COALESCE(f.data_selection->'connaissanceIds', '[]'::jsonb)
           ),
           'maxEntries', 40
         ),
         'medias', jsonb_build_object(
           'enabled', (f.phototheque OR f.liens),
           'label', 'Photos et liens',
           'usageHint', 'Utiliser les médias accessibles pour illustrer la réponse.',
           'types', to_jsonb(ARRAY_REMOVE(ARRAY[
             CASE WHEN f.phototheque THEN 'photo' END,
             CASE WHEN f.liens THEN 'lien' END
           ], NULL)),
           'selection', jsonb_build_object(
             'mode', COALESCE(f.data_selection->>'mode', 'all'),
             'ids', COALESCE(f.data_selection->'mediaIds', '[]'::jsonb)
           ),
           'access', 'illustration',
           'maxResults', 3
         )
       ),
       mission = CASE
         WHEN jsonb_array_length(COALESCE(f.fiche_definitions, '[]'::jsonb)) > 0
           THEN CASE
             WHEN f.recherche_active OR f.connaissances OR f.phototheque OR f.liens
               THEN 'hybrid'
             ELSE 'collect'
           END
         WHEN f.recherche_active OR f.connaissances OR f.phototheque OR f.liens
           THEN 'inform'
         ELSE NULL
       END
  FROM source_flags f
 WHERE c.id = f.id
   AND c.mission IS NULL;
