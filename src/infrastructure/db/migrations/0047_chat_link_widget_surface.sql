-- 0047_chat_link_widget_surface.sql — surface widget des liens de chat (ADR-0040)
-- Le widget est une surface de diffusion : type, identification et template
-- restent inchangés. Les contraintes empêchent un widget incompatible.

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'page';

ALTER TABLE chat_links
  ADD COLUMN IF NOT EXISTS widget_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_surface_check
  CHECK (surface IN ('page', 'widget'));

-- Un widget n'affiche ni formulaire de contact ni politique de confidentialité.
ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_widget_policy_check
  CHECK (surface <> 'widget' OR confidentialite_id IS NULL);

-- Un lien standard widget est forcément anonyme ; un lien spécifique reste
-- autorisé (le prospect est déjà connu).
ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_widget_identity_check
  CHECK (surface <> 'widget' OR type = 'specifique' OR identification_mode = 'anonymous');

-- Un widget doit avoir un template visuel supportant la surface widget.
ALTER TABLE chat_links
  ADD CONSTRAINT chat_links_widget_template_check
  CHECK (surface <> 'widget' OR visual_template_id IS NOT NULL);
