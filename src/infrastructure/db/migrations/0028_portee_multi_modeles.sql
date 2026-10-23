-- Portée multi-modèles des connaissances et des médias (vide = globale).

ALTER TABLE base_connaissances
  ADD COLUMN IF NOT EXISTS template_keys text[] NOT NULL DEFAULT '{}';

ALTER TABLE medias
  ADD COLUMN IF NOT EXISTS template_keys text[] NOT NULL DEFAULT '{}';

UPDATE base_connaissances
   SET template_keys = ARRAY[template_key]
 WHERE template_key IS NOT NULL
   AND template_keys = '{}';

UPDATE medias
   SET template_keys = ARRAY[template_key]
 WHERE template_key IS NOT NULL
   AND template_keys = '{}';

ALTER TABLE base_connaissances DROP COLUMN IF EXISTS template_key;
ALTER TABLE medias DROP COLUMN IF EXISTS template_key;

CREATE INDEX IF NOT EXISTS idx_connaissances_template_keys
  ON base_connaissances USING gin (template_keys);

CREATE INDEX IF NOT EXISTS idx_medias_template_keys
  ON medias USING gin (template_keys);
