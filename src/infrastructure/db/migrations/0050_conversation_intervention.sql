-- 0050_conversation_intervention.sql — intervention humaine (ADR-0043)
-- La conversation porte le mode IA/humain et l'opérateur en charge. Les messages
-- opérateur sont tracés avec leur auteur ; l'IA les traite comme des messages
-- assistant lors d'une reprise.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS intervention_mode text NOT NULL DEFAULT 'ai';
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_operator_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS human_takeover_at timestamptz;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_visitor_message_at timestamptz;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_operator_message_at timestamptz;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_intervention_mode_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_intervention_mode_check
  CHECK (intervention_mode IN ('ai', 'human'));

CREATE INDEX IF NOT EXISTS conversations_intervention_idx
  ON conversations (organization_id, intervention_mode)
  WHERE archivee = false;

-- Backfill : l'historique existant n'a pas de message opérateur.
UPDATE conversations c
SET last_visitor_message_at = m.last_visitor_at
FROM (
  SELECT conversation_id, max(created_at) AS last_visitor_at
    FROM chat_messages
   WHERE role = 'user'
   GROUP BY conversation_id
) m
WHERE m.conversation_id = c.id AND c.last_visitor_message_at IS NULL;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user', 'assistant', 'operator'));

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS author_user_id uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_author_idx
  ON chat_messages (author_user_id)
  WHERE author_user_id IS NOT NULL;

COMMENT ON COLUMN conversations.intervention_mode IS
  'ai = l''IA répond ; human = un opérateur a pris la main (ADR-0043).';
COMMENT ON COLUMN conversations.assigned_user_id IS
  'Opérateur actuellement en charge (null en mode ai).';
COMMENT ON COLUMN conversations.last_operator_user_id IS
  'Dernier opérateur intervenu, conservé après un retour à l''IA.';
COMMENT ON COLUMN chat_messages.author_user_id IS
  'Auteur humain d''un message opérateur (ADR-0043).';
