-- 0075_invitation_ai_provisioning.sql — snapshot de provisioning IA d'une invitation (ADR-0065).
-- Additif : aucune invitation existante n'est modifiée et aucun compteur n'est touché.

ALTER TABLE organization_invitations
  ADD COLUMN IF NOT EXISTS provisioning jsonb;

ALTER TABLE organization_invitations
  ADD CONSTRAINT organization_invitations_provisioning_object_check
  CHECK (provisioning IS NULL OR jsonb_typeof(provisioning) = 'object');
