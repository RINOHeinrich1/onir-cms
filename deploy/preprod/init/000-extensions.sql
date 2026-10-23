-- Extensions utiles au schéma du socle (uuid, digest).
-- Exécuté automatiquement au premier démarrage du conteneur (docker-entrypoint-initdb.d).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
