-- 0048_chat_link_channels.sql — canaux de diffusion multiples (ADR-0041)
-- Le lien porte le métier ; chaque canal (page/widget) porte sa diffusion.
-- Les colonnes de chat_links.surface & co. restent temporairement en place
-- comme miroir de compatibilité pendant la transition.

CREATE TABLE IF NOT EXISTS chat_link_channels (
  link_id uuid NOT NULL REFERENCES chat_links (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('page', 'widget')),
  enabled boolean NOT NULL DEFAULT false,
  identification_mode text NOT NULL DEFAULT 'contact'
    CHECK (identification_mode IN ('contact', 'anonymous', 'otp', 'internal')),
  confidentialite_id uuid REFERENCES confidentialites (id) ON DELETE SET NULL,
  visual_template_id uuid REFERENCES visual_templates (id) ON DELETE SET NULL,
  visual_template_version text,
  visual_template_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_template_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, channel),
  CONSTRAINT chat_link_channels_widget_no_policy
    CHECK (channel <> 'widget' OR confidentialite_id IS NULL),
  CONSTRAINT chat_link_channels_config_object
    CHECK (jsonb_typeof(visual_template_config) = 'object'),
  CONSTRAINT chat_link_channels_params_object
    CHECK (jsonb_typeof(visual_template_params) = 'object'),
  CONSTRAINT chat_link_channels_channel_config_object
    CHECK (jsonb_typeof(channel_config) = 'object')
);

CREATE INDEX IF NOT EXISTS chat_link_channels_enabled_idx
  ON chat_link_channels (link_id, channel)
  WHERE enabled = true;

-- Canal page : reprend la configuration historique lorsque la surface active
-- était `page`. Les liens widget démarrent avec le canal page désactivé.
INSERT INTO chat_link_channels (
  link_id,
  channel,
  enabled,
  identification_mode,
  confidentialite_id,
  visual_template_id,
  visual_template_version,
  visual_template_config,
  visual_template_params,
  channel_config
)
SELECT
  l.id,
  'page',
  l.surface = 'page',
  CASE WHEN l.surface = 'page' THEN l.identification_mode ELSE 'contact' END,
  CASE WHEN l.surface = 'page' THEN l.confidentialite_id ELSE NULL END,
  CASE WHEN l.surface = 'page' THEN l.visual_template_id ELSE NULL END,
  CASE WHEN l.surface = 'page' THEN l.visual_template_version ELSE NULL END,
  CASE WHEN l.surface = 'page' THEN l.visual_template_config ELSE '{}'::jsonb END,
  CASE WHEN l.surface = 'page' THEN l.visual_template_params ELSE '{}'::jsonb END,
  '{}'::jsonb
FROM chat_links l
ON CONFLICT (link_id, channel) DO NOTHING;

-- Canal widget : reprend la configuration historique lorsque la surface active
-- était `widget`. Un widget standard est anonyme et sans politique.
INSERT INTO chat_link_channels (
  link_id,
  channel,
  enabled,
  identification_mode,
  confidentialite_id,
  visual_template_id,
  visual_template_version,
  visual_template_config,
  visual_template_params,
  channel_config
)
SELECT
  l.id,
  'widget',
  l.surface = 'widget',
  CASE
    WHEN l.surface = 'widget' AND l.type = 'standard' THEN 'anonymous'
    WHEN l.surface = 'widget' THEN l.identification_mode
    ELSE 'anonymous'
  END,
  NULL,
  CASE WHEN l.surface = 'widget' THEN l.visual_template_id ELSE NULL END,
  CASE WHEN l.surface = 'widget' THEN l.visual_template_version ELSE NULL END,
  CASE WHEN l.surface = 'widget' THEN l.visual_template_config ELSE '{}'::jsonb END,
  CASE WHEN l.surface = 'widget' THEN l.visual_template_params ELSE '{}'::jsonb END,
  CASE WHEN l.surface = 'widget' THEN l.widget_config ELSE '{}'::jsonb END
FROM chat_links l
ON CONFLICT (link_id, channel) DO NOTHING;

-- Origine de chaque conversation, pour appliquer les règles du canal courant.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'page'
    CHECK (channel IN ('page', 'widget'));

UPDATE conversations c
SET channel = l.surface
FROM chat_links l
WHERE l.id = c.link_id;

CREATE INDEX IF NOT EXISTS conversations_link_channel_idx
  ON conversations (link_id, channel);

COMMENT ON TABLE chat_link_channels IS
  'Canaux de diffusion d''un lien (ADR-0041) : page publique ou widget.';
COMMENT ON COLUMN chat_links.surface IS
  'Déprécié (ADR-0041) : miroir de compatibilité du canal actif.';
