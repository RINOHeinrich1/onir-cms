-- Provisionnement du rôle de lecture des ressources de données (ADR-0026).
--
-- Voie recommandée : panneau super-admin (Templates visuels → Compte de lecture
-- des données → Générer un mot de passe), qui stocke le secret chiffré et
-- permet la rotation sans SSH. Ce script est le repli CLI.
--
-- Usage (rôle ayant CREATEROLE, idéalement superutilisateur) :
--   psql "$DATABASE_URL" -v reader_password="..." -f scripts/provision-template-reader.sql
--
-- - `template_reader` : rôle NOLOGIN porteur des GRANT (créé par la migration 0029).
-- - `template_reader_login` : rôle LOGIN sans privilège propre, membre de
--   `template_reader` ; l'exécuteur pose `SET LOCAL ROLE template_reader`.
-- Aucun mot de passe n'est stocké dans le dépôt.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader') THEN
    CREATE ROLE template_reader NOLOGIN;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader_login') THEN
    CREATE ROLE template_reader_login LOGIN;
  END IF;
END;
$$;

ALTER ROLE template_reader_login WITH LOGIN PASSWORD :'reader_password';
GRANT template_reader TO template_reader_login;

GRANT USAGE ON SCHEMA template_read TO template_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA template_read TO template_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA template_read GRANT SELECT ON TABLES TO template_reader;

\echo 'Rôle prêt. Renseignez TEMPLATE_DATABASE_URL avec template_reader_login.'
