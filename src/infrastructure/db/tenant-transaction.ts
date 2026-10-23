import type { Pool, PoolClient } from "pg";

/**
 * Exécute `fn` dans une transaction avec le contexte tenant positionné
 * (`app.organization_id`). Aujourd'hui l'isolation est applicative explicite
 * (ADR-0025 §10) ; ce contexte est le point d'ancrage de la future RLS.
 * `set_config(..., true)` est local à la transaction (aucune fuite entre
 * connexions du pool).
 */
export async function withTenantTransaction<T>(
  pool: Pool,
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
