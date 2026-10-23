import { Client, type Pool, type PoolClient } from "pg";
import { UnprocessableError } from "@/application/errors";
import type { TemplateReaderProvisioner } from "@/application/ports/template-reader-provisioner";

const READER_ROLE = "template_reader";
const LOGIN_ROLE = "template_reader_login";
const PASSWORD = /^[0-9a-f]{32,64}$/;

type Queryable = Pool | PoolClient;

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function validityLiteral(validUntil: Date | null): string {
  return validUntil === null ? "'infinity'" : sqlLiteral(validUntil.toISOString());
}

function permissionMessage(error: unknown): never {
  const code = (error as { code?: string } | null)?.code;
  if (code === "42501" || code === "25006") {
    throw new UnprocessableError(
      "Le compte applicatif n'a pas le droit CREATEROLE : provisionnez les rôles en base (script d'installation) ou accordez CREATEROLE temporairement.",
    );
  }
  throw error;
}

/**
 * Provisionne les rôles et applique mot de passe + VALID UNTIL.
 * `executor` peut être un client en transaction : l'appelant contrôle COMMIT.
 */
export async function provisionReaderAccount(
  executor: Queryable,
  password: string,
  validUntil: Date | null,
): Promise<void> {
  if (!PASSWORD.test(password)) {
    throw new UnprocessableError("Mot de passe de lecture invalide (hex 32–64)");
  }
  try {
    await executor.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${READER_ROLE}') THEN
          CREATE ROLE ${READER_ROLE} NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LOGIN_ROLE}') THEN
          CREATE ROLE ${LOGIN_ROLE} LOGIN;
        END IF;
      END
      $$;
    `);
    await executor.query(
      `ALTER ROLE ${LOGIN_ROLE} WITH LOGIN PASSWORD ${sqlLiteral(password)} VALID UNTIL ${validityLiteral(validUntil)}`,
    );
    await executor.query(`GRANT ${READER_ROLE} TO ${LOGIN_ROLE}`);
    await executor.query(`GRANT USAGE ON SCHEMA template_read TO ${READER_ROLE}`);
    await executor.query(`GRANT SELECT ON ALL TABLES IN SCHEMA template_read TO ${READER_ROLE}`);
    await executor.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA template_read GRANT SELECT ON TABLES TO ${READER_ROLE}`,
    );
  } catch (error) {
    permissionMessage(error);
  }
}

/** Applique uniquement VALID UNTIL au rôle de connexion. */
export async function setReaderValidity(
  executor: Queryable,
  validUntil: Date | null,
): Promise<void> {
  try {
    await executor.query(
      `ALTER ROLE ${LOGIN_ROLE} WITH VALID UNTIL ${validityLiteral(validUntil)}`,
    );
  } catch (error) {
    permissionMessage(error);
  }
}

export function pgTemplateReaderProvisioner(_pool: Pool): TemplateReaderProvisioner {
  return {
    async testConnection(connectionString: string): Promise<string> {
      const client = new Client({ connectionString, application_name: "onirtech-reader-test" });
      await client.connect();
      try {
        const { rows } = await client.query<{ who: string }>("SELECT current_user AS who");
        return rows[0]?.who ?? "";
      } finally {
        await client.end();
      }
    },
  };
}
