import type { Pool, PoolClient } from "pg";
import type {
  TemplateReaderCredentials,
  TemplateReaderCredentialsRepository,
} from "@/application/ports/template-reader-credentials-repository";

type Row = {
  user_name: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
  revision: number;
  rotated_at: Date;
  rotated_by: string | null;
  validity_days: number;
  expires_at: Date | null;
};

function toCredentials(row: Row): TemplateReaderCredentials {
  return {
    userName: row.user_name,
    sealed: {
      ciphertext: row.password_ciphertext,
      iv: row.password_iv,
      tag: row.password_tag,
    },
    revision: row.revision,
    rotatedAt: row.rotated_at.toISOString(),
    rotatedBy: row.rotated_by,
    validityDays: row.validity_days,
    expiresAt: row.expires_at === null ? null : row.expires_at.toISOString(),
  };
}

const COLUMNS =
  "user_name, password_ciphertext, password_iv, password_tag, revision, rotated_at, rotated_by, validity_days, expires_at";

type Queryable = Pool | PoolClient;

type SaveInput = {
  sealed: { ciphertext: string; iv: string; tag: string };
  actorId: string | null;
  validityDays: number;
  expiresAt: string | null;
};

type PolicyInput = {
  validityDays: number;
  expiresAt: string | null;
  actorId: string | null;
};

/** Écriture du secret ; utilisable dans une transaction via `executor`. */
export async function saveReaderCredentials(
  executor: Queryable,
  input: SaveInput,
): Promise<TemplateReaderCredentials> {
  const { rows } = await executor.query<Row>(
    `INSERT INTO template_reader_credentials
       (id, password_ciphertext, password_iv, password_tag, rotated_by, validity_days, expires_at)
     VALUES (true, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       password_ciphertext = EXCLUDED.password_ciphertext,
       password_iv = EXCLUDED.password_iv,
       password_tag = EXCLUDED.password_tag,
       rotated_by = EXCLUDED.rotated_by,
       rotated_at = now(),
       validity_days = EXCLUDED.validity_days,
       expires_at = EXCLUDED.expires_at,
       revision = template_reader_credentials.revision + 1
     RETURNING ${COLUMNS}`,
    [
      input.sealed.ciphertext,
      input.sealed.iv,
      input.sealed.tag,
      input.actorId,
      input.validityDays,
      input.expiresAt,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Identifiants du compte de lecture non enregistrés");
  return toCredentials(row);
}

/** Mise à jour de la politique, utilisable dans une transaction. */
export async function updateReaderPolicy(
  executor: Queryable,
  input: PolicyInput,
): Promise<TemplateReaderCredentials> {
  const { rows } = await executor.query<Row>(
    `UPDATE template_reader_credentials
        SET validity_days = $1,
            expires_at = $2,
            rotated_by = $3
      WHERE id = true
      RETURNING ${COLUMNS}`,
    [input.validityDays, input.expiresAt, input.actorId],
  );
  const row = rows[0];
  if (!row) throw new Error("Aucun compte de lecture configuré");
  return toCredentials(row);
}

export function pgTemplateReaderCredentialsRepository(
  pool: Pool,
): TemplateReaderCredentialsRepository {
  return {
    async find(): Promise<TemplateReaderCredentials | null> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM template_reader_credentials LIMIT 1`,
      );
      return rows[0] ? toCredentials(rows[0]) : null;
    },

    async save(input): Promise<TemplateReaderCredentials> {
      return saveReaderCredentials(pool, input);
    },

    async updatePolicy(input): Promise<TemplateReaderCredentials> {
      return updateReaderPolicy(pool, input);
    },
  };
}
