import type { Pool } from "pg";

const LOCK_KEY = "template_reader_rotation";

/**
 * Sérialise toutes les mutations du compte lecteur (rotation manuelle,
 * politique de validité, renouvellement automatique). Sans ce verrou,
 * deux ALTER ROLE + sauvegardes chiffrées peuvent s'entrelacer et laisser
 * le rôle avec un mot de passe différent de celui stocké.
 */
export async function withTemplateReaderLock<T>(pool: Pool, action: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [LOCK_KEY]);
    return await action();
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}
