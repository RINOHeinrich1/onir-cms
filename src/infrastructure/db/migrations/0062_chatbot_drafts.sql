-- 0062_chatbot_drafts.sql — brouillons persistants de création de chatbot.
-- Migration ADDITIVE : aucune donnée de chatbot existante n'est modifiée.
-- Le brouillon n'est PAS un chatbot : il ne porte ni jeton, ni URL publique,
-- ni configuration runtime. `state` contient l'état du wizard (étapes, choix,
-- sélection de données, métadonnées des photos temporaires).
-- Les photos ajoutées au brouillon sont des médias `actif = false` sans portée,
-- finalisés (portée + actif) uniquement à la création du chatbot.

CREATE TABLE IF NOT EXISTS chatbot_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT '',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_drafts_org_updated_idx
  ON chatbot_drafts (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_drafts_created_by_idx
  ON chatbot_drafts (created_by);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chatbot_drafts_state_object'
  ) THEN
    ALTER TABLE chatbot_drafts
      ADD CONSTRAINT chatbot_drafts_state_object
      CHECK (jsonb_typeof(state) = 'object');
  END IF;
END $$;

COMMENT ON TABLE chatbot_drafts IS
  'Brouillons de création de chatbot (wizard) — jamais exposés comme chatbots publics.';
COMMENT ON COLUMN chatbot_drafts.state IS
  'État sérialisé du wizard : étape, configuration, canaux, quotas, données et photos temporaires.';
