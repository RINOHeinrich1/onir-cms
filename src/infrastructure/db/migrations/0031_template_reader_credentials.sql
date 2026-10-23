-- 0031_template_reader_credentials.sql — compte de lecture des données (ADR-0026)
-- Singleton : le mot de passe du rôle de connexion `template_reader_login` est
-- chiffré (AES-256-GCM) pour être régénérable depuis le panneau super-admin,
-- sans passer par le serveur ni modifier TEMPLATE_DATABASE_URL.

CREATE TABLE IF NOT EXISTS template_reader_credentials (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  user_name text NOT NULL DEFAULT 'template_reader_login'
    CHECK (user_name ~ '^[a-z][a-z0-9_]{2,40}$'),
  password_ciphertext text NOT NULL,
  password_iv text NOT NULL,
  password_tag text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  rotated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  rotated_at timestamptz NOT NULL DEFAULT now()
);
