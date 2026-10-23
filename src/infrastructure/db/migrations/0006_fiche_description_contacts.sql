-- 0006_fiche_description_contacts.sql — description fiche + contacts visiteurs (US-FICHE-001)
-- conversations.visitor_contacts : JSONB [{type, valeur}] (téléphone, whatsapp,
-- site web, autre) collectés par ContactGate ; fiches.description : présentation
-- du projet (objet, rôle, périmètre).
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_contacts jsonb NOT NULL DEFAULT '[]';
ALTER TABLE fiches ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
