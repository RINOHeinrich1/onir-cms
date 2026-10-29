-- 0060_fiche_collectes.sql — fiches de collecte réutilisables (ADR-0049).
-- Une fiche est indépendante des chatbots : elle peut être importée (copie)
-- dans la configuration d'un ou plusieurs chatbots. Le contenu est versionné :
-- toute édition crée une version immuable dans `fiche_collecte_versions`, et
-- `fiche_collectes` porte la version courante (lecture rapide).

CREATE TABLE IF NOT EXISTS fiche_collectes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  render_template text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key),
  CHECK (jsonb_typeof(fields) = 'array')
);

CREATE INDEX IF NOT EXISTS fiche_collectes_org_idx
  ON fiche_collectes (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fiche_collecte_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiche_collecte_id uuid NOT NULL REFERENCES fiche_collectes (id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  key text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  render_template text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiche_collecte_id, version),
  CHECK (jsonb_typeof(fields) = 'array')
);

CREATE INDEX IF NOT EXISTS fiche_collecte_versions_fiche_idx
  ON fiche_collecte_versions (fiche_collecte_id, version DESC);
