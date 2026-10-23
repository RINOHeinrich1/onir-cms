import type { Pool, PoolClient } from "pg";
import { LEGACY_ORGANIZATION_ID } from "@/domain/tenant";

/** Modèles de raisonnement par défaut (H6), clonés dans chaque organisation. */
const DEFAULT_TEMPLATE_KEYS = ["fiche-projet", "investisseur", "presentation"] as const;

/** Politique de confidentialité par défaut seedée par la migration 0017. */
const DEFAULT_CONFIDENTIALITE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * ADR-0025 §7/§9 — provisionne une organisation vide de façon **idempotente**
 * et atomique : clone les modèles de raisonnement par défaut et la politique
 * de confidentialité par défaut, puis assigne tous les templates visuels.
 * Aucune donnée métier (prospect, lien, conversation, fiche, média…) n'est créée.
 */
export async function provisionOrganizationDefaults(
  pool: Pool,
  organizationId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await provisionOrganizationDefaultsWithClient(client, organizationId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Variante transactionnelle : le client est fourni par l'appelant. */
export async function provisionOrganizationDefaultsWithClient(
  client: PoolClient,
  organizationId: string,
): Promise<void> {
  const target = await client.query("SELECT 1 FROM organizations WHERE id = $1", [organizationId]);
  if ((target.rowCount ?? 0) === 0) {
    throw new Error("Organisation introuvable pour le provisioning");
  }

  for (const key of DEFAULT_TEMPLATE_KEYS) {
    await client.query(
      `INSERT INTO chat_templates (organization_id, key, label, description, created_by)
         SELECT $1, t.key, t.label, t.description, t.created_by
           FROM chat_templates t
          WHERE t.organization_id = $2 AND t.key = $3
            AND NOT EXISTS (
              SELECT 1 FROM chat_templates d
              WHERE d.organization_id = $1 AND d.key = $3
            )`,
      [organizationId, LEGACY_ORGANIZATION_ID, key],
    );

    await client.query(
      `INSERT INTO chat_template_versions (template_id, version, definition, created_by)
         SELECT dst.id, v.version, v.definition, v.created_by
           FROM chat_template_versions v
           JOIN chat_templates src ON src.id = v.template_id
           JOIN chat_templates dst ON dst.organization_id = $1 AND dst.key = src.key
          WHERE src.organization_id = $2 AND src.key = $3
            AND NOT EXISTS (
              SELECT 1 FROM chat_template_versions dv
              WHERE dv.template_id = dst.id AND dv.version = v.version
            )`,
      [organizationId, LEGACY_ORGANIZATION_ID, key],
    );
  }

  await client.query(
    `INSERT INTO confidentialites (organization_id, titre, texte, lien, actif, created_by)
       SELECT $1, c.titre, c.texte, c.lien, c.actif, c.created_by
         FROM confidentialites c
        WHERE c.id = $2
          AND NOT EXISTS (
            SELECT 1 FROM confidentialites d
            WHERE d.organization_id = $1 AND lower(d.titre) = lower(c.titre)
          )`,
    [organizationId, DEFAULT_CONFIDENTIALITE_ID],
  );

  await client.query(
    `INSERT INTO organization_visual_templates (organization_id, template_id)
     SELECT $1, id FROM visual_templates
     ON CONFLICT DO NOTHING`,
    [organizationId],
  );
}
