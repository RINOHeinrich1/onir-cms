-- 0049_chat_operators.sql — rôle « Opérateur chat » et portée par liens (ADR-0043)
-- Le rôle est porté par la membership d'organisation. La portée est optionnelle :
-- l'absence de ligne dans chat_operator_scopes signifie « tous les liens ».

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'marketeur', 'lecteur', 'operateur'));

ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('admin', 'marketeur', 'lecteur', 'operateur'));

ALTER TABLE organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_role_check;
ALTER TABLE organization_invitations ADD CONSTRAINT organization_invitations_role_check
  CHECK (role IN ('admin', 'marketeur', 'lecteur', 'operateur'));

-- Support de la FK composite (link_id, organization_id).
CREATE UNIQUE INDEX IF NOT EXISTS chat_links_id_organization_uidx
  ON chat_links (id, organization_id);

-- Portée d'un opérateur : all_links = true par défaut. Une ligne explicite avec
-- all_links = false restreint l'accès aux liens de chat_link_operators.
CREATE TABLE IF NOT EXISTS chat_operator_scopes (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  all_links boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT chat_operator_scopes_membership_fk
    FOREIGN KEY (organization_id, user_id)
    REFERENCES organization_members (organization_id, user_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_link_operators (
  organization_id uuid NOT NULL,
  link_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, user_id),
  CONSTRAINT chat_link_operators_membership_fk
    FOREIGN KEY (organization_id, user_id)
    REFERENCES organization_members (organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT chat_link_operators_link_fk
    FOREIGN KEY (link_id, organization_id)
    REFERENCES chat_links (id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_link_operators_user_idx
  ON chat_link_operators (organization_id, user_id);

COMMENT ON TABLE chat_operator_scopes IS
  'Portée des opérateurs chat (ADR-0043) : absence = tous les liens.';
COMMENT ON TABLE chat_link_operators IS
  'Liens explicitement assignés à un opérateur chat (ADR-0043).';
