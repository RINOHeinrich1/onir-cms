-- 0090_email_otp.sql — transport email multi-tenant et identification OTP (ADR-0099)
-- Migration additive : les liens existants restent en mode contact/anonymous.

CREATE TABLE IF NOT EXISTS organization_email_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
  host text NOT NULL,
  port integer NOT NULL,
  secure boolean NOT NULL DEFAULT true,
  username text NOT NULL DEFAULT '',
  password_enc text NOT NULL DEFAULT '',
  from_email text NOT NULL,
  from_name text NOT NULL DEFAULT '',
  reply_to text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT organization_email_settings_port_check CHECK (port BETWEEN 1 AND 65535),
  CONSTRAINT organization_email_settings_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS platform_email_settings (
  id text PRIMARY KEY DEFAULT 'default',
  host text NOT NULL,
  port integer NOT NULL,
  secure boolean NOT NULL DEFAULT true,
  username text NOT NULL DEFAULT '',
  password_enc text NOT NULL DEFAULT '',
  from_email text NOT NULL,
  from_name text NOT NULL DEFAULT '',
  reply_to text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT platform_email_settings_singleton_check CHECK (id = 'default'),
  CONSTRAINT platform_email_settings_port_check CHECK (port BETWEEN 1 AND 65535),
  CONSTRAINT platform_email_settings_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS chat_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'page',
  surface text NOT NULL DEFAULT 'page',
  email text NOT NULL,
  email_hash text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  consentement boolean NOT NULL DEFAULT false,
  consumed_at timestamptz,
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_otp_challenges_attempts_check CHECK (attempts >= 0),
  CONSTRAINT chat_otp_challenges_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS chat_otp_challenges_link_created_idx
  ON chat_otp_challenges (link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_otp_challenges_email_created_idx
  ON chat_otp_challenges (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_otp_challenges_expires_idx
  ON chat_otp_challenges (expires_at);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS visitor_email_verified_at timestamptz;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

COMMENT ON TABLE organization_email_settings IS
  'SMTP propre à une organisation (ADR-0099). Le mot de passe est chiffré.';
COMMENT ON TABLE platform_email_settings IS
  'SMTP par défaut plateforme, utilisé si une organisation n''a aucune configuration (ADR-0099).';
COMMENT ON TABLE chat_otp_challenges IS
  'Challenges OTP email à usage unique, hashés et expirants (ADR-0099).';
