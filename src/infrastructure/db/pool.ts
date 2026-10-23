import { Pool } from "pg";
import { databaseUrl } from "@/lib/env";

let pool: Pool | undefined;

/** Pool PostgreSQL singleton (A013) — accès unique et réutilisé dans le process. */
export function getPool(): Pool {
  if (pool === undefined) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: 10,
    });
  }
  return pool;
}
