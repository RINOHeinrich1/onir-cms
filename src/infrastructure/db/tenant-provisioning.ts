import type { Pool, PoolClient } from "pg";

/** Politique de confidentialité par défaut seedée par la migration 0017. */
const DEFAULT_CONFIDENTIALITE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * ADR-0025 §7/§9 — provisionne une organisation vide de façon **idempotente**
 * et atomique : clone la politique de confidentialité par défaut, puis
 * assigne tous les templates visuels. Aucune donnée métier (prospect, lien,
 * conversation, fiche, média…) n'est créée.
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
