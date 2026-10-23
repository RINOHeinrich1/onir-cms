-- Base jetable réservée aux tests d'intégration (profil Docker local).
SELECT 'CREATE DATABASE onir_cms_test OWNER onir_cms'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'onir_cms_test')\gexec
