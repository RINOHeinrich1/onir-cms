-- 0003_chat.sql — liens de chat, conversations et messages (US-LIENS-001, US-CHAT-001)
-- Le jeton partageable n'est JAMAIS stocké en clair : seul son hash SHA-256 est persisté.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

CREATE TABLE IF NOT EXISTS chat_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('specifique', 'standard')),
  prospect_id uuid REFERENCES prospects (id) ON DELETE SET NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  actif boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_links_prospect_id_idx ON chat_links (prospect_id);
CREATE INDEX IF NOT EXISTS chat_links_created_by_idx ON chat_links (created_by);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  visitor_nom text NOT NULL DEFAULT '',
  visitor_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_link_id_idx ON conversations (link_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_id_idx ON chat_messages (conversation_id);
