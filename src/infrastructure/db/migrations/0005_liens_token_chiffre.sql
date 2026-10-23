-- 0005_liens_token_chiffre.sql — jeton recouvrable pour copie stable (US-LIENS-001)
-- Le hash reste la clé de recherche ; le chiffré (AES-256-GCM, clé LINK_TOKEN_KEY)
-- permet de ré-afficher l'URL sans rotation. Lignes existantes : NULL → régénéré
-- une fois à la première copie.
-- Migration immuable : toute évolution passe par un nouveau fichier 000N_*.sql.

ALTER TABLE chat_links ADD COLUMN IF NOT EXISTS token_enc text;
