-- 0023_organizations_backfill.sql — backfill legacy Onirtech + organisation personnelle
-- ADR-0025 §8 : toutes les données existantes rejoignent `Onirtech` ; le plus ancien
-- admin devient super-admin et reçoit une organisation personnelle vide provisionnée.
-- Les autres utilisateurs n'obtiennent aucune membership.
--
-- Les unicités globales doivent être retirées AVANT le clonage inter-organisations
-- (les unicités locales sont créées en 0025). Le contrat (drop des DEFAULT legacy)
-- est différé (0026, hors release).

DROP INDEX IF EXISTS base_connaissances_titre_idx;
DROP INDEX IF EXISTS medias_type_libelle_idx;
DROP INDEX IF EXISTS confidentialites_titre_idx;
ALTER TABLE chat_templates DROP CONSTRAINT IF EXISTS chat_templates_key_key;

DO $$
DECLARE
  legacy uuid := '00000000-0000-0000-0000-000000000025';
  admin_id uuid;
  admin_email text;
  personal uuid;
  local_name text;
  default_policy uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO organizations (id, name)
  VALUES (legacy, 'Onirtech')
  ON CONFLICT (id) DO NOTHING;

  SELECT id, email INTO admin_id, admin_email
  FROM users
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  IF admin_id IS NOT NULL THEN
    UPDATE users
    SET is_super_admin = true,
        last_active_organization_id = legacy,
        updated_at = now()
    WHERE id = admin_id;

    local_name := split_part(admin_email, '@', 1);
    IF local_name IS NULL OR btrim(local_name) = '' THEN
      local_name := 'Organisation personnelle';
    END IF;

    INSERT INTO organizations (name, created_by)
    VALUES (local_name, admin_id)
    ON CONFLICT (lower(name)) DO NOTHING
    RETURNING id INTO personal;

    IF personal IS NULL THEN
      SELECT id INTO personal FROM organizations WHERE lower(name) = lower(local_name);
    END IF;

    -- Collision avec Onirtech elle-même : créer un nom distinct.
    IF personal = legacy THEN
      INSERT INTO organizations (name, created_by)
      VALUES (local_name || ' (personnel)', admin_id)
      RETURNING id INTO personal;
    END IF;

    INSERT INTO organization_members (organization_id, user_id, role, created_by)
    VALUES (legacy, admin_id, 'admin', admin_id)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO organization_members (organization_id, user_id, role, created_by)
    VALUES (personal, admin_id, 'admin', admin_id)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    UPDATE sessions
    SET active_organization_id = legacy
    WHERE user_id = admin_id AND active_organization_id IS NULL;
  END IF;

  -- Backfill de toutes les données métier existantes vers l'organisation legacy.
  UPDATE prospects SET organization_id = legacy WHERE organization_id IS NULL;
  UPDATE chat_links SET organization_id = legacy WHERE organization_id IS NULL;
  UPDATE conversations SET organization_id = legacy WHERE organization_id IS NULL;
  UPDATE fiches SET organization_id = legacy WHERE organization_id IS NULL;
  UPDATE chat_templates SET organization_id = legacy WHERE organization_id IS NULL;
  UPDATE base_connaissances SET organization_id = legacy WHERE organization_id IS NULL;
  UPDATE medias SET organization_id = legacy WHERE organization_id IS NULL;
  UPDATE confidentialites SET organization_id = legacy WHERE organization_id IS NULL;

  -- Assignation du catalogue visuel global à Onirtech.
  INSERT INTO organization_visual_templates (organization_id, template_id)
  SELECT legacy, id FROM visual_templates
  ON CONFLICT DO NOTHING;

  IF personal IS NOT NULL AND admin_id IS NOT NULL THEN
    -- Modèles de raisonnement par défaut (clonés).
    INSERT INTO chat_templates (organization_id, key, label, description, created_by)
    SELECT personal, t.key, t.label, t.description, t.created_by
    FROM chat_templates t
    WHERE t.organization_id = legacy
      AND t.key IN ('fiche-projet', 'investisseur', 'presentation');

    INSERT INTO chat_template_versions (template_id, version, definition, created_by)
    SELECT dst.id, v.version, v.definition, v.created_by
    FROM chat_template_versions v
    JOIN chat_templates src ON src.id = v.template_id AND src.organization_id = legacy
    JOIN chat_templates dst ON dst.organization_id = personal AND dst.key = src.key
    WHERE src.key IN ('fiche-projet', 'investisseur', 'presentation')
      AND NOT EXISTS (
        SELECT 1 FROM chat_template_versions dv
        WHERE dv.template_id = dst.id AND dv.version = v.version
      );

    -- Politique de confidentialité par défaut (clonée avec un nouvel identifiant).
    INSERT INTO confidentialites (organization_id, titre, texte, lien, actif, created_by)
    SELECT personal, c.titre, c.texte, c.lien, c.actif, c.created_by
    FROM confidentialites c
    WHERE c.id = default_policy
      AND NOT EXISTS (
        SELECT 1 FROM confidentialites c2
        WHERE c2.organization_id = personal AND lower(c2.titre) = lower(c.titre)
      );

    -- Templates visuels : tous assignés à l'organisation personnelle.
    INSERT INTO organization_visual_templates (organization_id, template_id)
    SELECT personal, id FROM visual_templates
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
