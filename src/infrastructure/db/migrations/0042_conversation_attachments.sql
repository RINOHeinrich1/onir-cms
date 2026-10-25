-- 0042_conversation_attachments.sql — champs fichier et pièces jointes (ADR-0034)
-- Une pièce est stockée hors base (storage_key) et rattachée à une conversation,
-- puis à un message utilisateur et/ou à une fiche. Aucun OCR / aucune IA en v1.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS conversation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  message_id uuid REFERENCES chat_messages (id) ON DELETE SET NULL,
  field_name text NOT NULL,
  field_label text NOT NULL DEFAULT '',
  original_name text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_attachments_conversation_idx
  ON conversation_attachments (conversation_id);
CREATE INDEX IF NOT EXISTS conversation_attachments_org_idx
  ON conversation_attachments (organization_id);
CREATE INDEX IF NOT EXISTS conversation_attachments_message_idx
  ON conversation_attachments (message_id);
CREATE INDEX IF NOT EXISTS conversation_attachments_field_idx
  ON conversation_attachments (conversation_id, field_name);

CREATE TABLE IF NOT EXISTS fiche_attachments (
  fiche_id uuid NOT NULL REFERENCES fiches (id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES conversation_attachments (id) ON DELETE CASCADE,
  field_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fiche_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS fiche_attachments_attachment_idx
  ON fiche_attachments (attachment_id);
CREATE INDEX IF NOT EXISTS fiche_attachments_field_idx
  ON fiche_attachments (fiche_id, field_name);
