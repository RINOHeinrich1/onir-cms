-- 0064_fiches_sans_modele_raisonnement.sql — ADR-0055.
-- Une fiche peut exister sans modèle de raisonnement et être liée à 0..N chatbots.

ALTER TABLE fiches
  ALTER COLUMN template_key DROP NOT NULL,
  ALTER COLUMN template_version DROP NOT NULL;

ALTER TABLE fiches
  ALTER COLUMN template_key DROP DEFAULT,
  ALTER COLUMN template_version DROP DEFAULT;

ALTER TABLE fiches
  ADD COLUMN IF NOT EXISTS definition jsonb;

CREATE TABLE IF NOT EXISTS fiche_chat_links (
  fiche_id uuid NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  chat_link_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fiche_id, chat_link_id),
  FOREIGN KEY (organization_id, chat_link_id)
    REFERENCES chat_links (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS fiche_chat_links_link_idx
  ON fiche_chat_links (organization_id, chat_link_id, fiche_id);
CREATE INDEX IF NOT EXISTS fiche_chat_links_fiche_idx
  ON fiche_chat_links (fiche_id);

-- Backfill non destructif des définitions des anciennes fiches.
UPDATE fiches f
   SET definition = v.definition
  FROM chat_templates t
  JOIN chat_template_versions v ON v.template_id = t.id
 WHERE f.definition IS NULL
   AND f.organization_id = t.organization_id
   AND f.template_key = t.key
   AND f.template_version = v.version;

-- Backfill des associations : une fiche générée depuis une conversation est
-- rattachée au chatbot de cette conversation. Une fiche manuelle reste à 0.
INSERT INTO fiche_chat_links (fiche_id, chat_link_id, organization_id)
SELECT f.id, c.link_id, f.organization_id
  FROM fiches f
  JOIN conversations c
    ON c.id = f.conversation_id
   AND c.organization_id = f.organization_id
 WHERE f.conversation_id IS NOT NULL
ON CONFLICT (fiche_id, chat_link_id) DO NOTHING;

COMMENT ON COLUMN fiches.definition IS
  'Snapshot de la définition de fiche ; remplace le modèle de raisonnement (ADR-0055).';
COMMENT ON TABLE fiche_chat_links IS
  'Relation 0..N entre une fiche et les chatbots (ADR-0055).';
