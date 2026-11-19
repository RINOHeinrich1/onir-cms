import type { Pool } from "pg";
import type { EmailSettingsRepository } from "@/application/ports/email-settings-repository";
import type { StoredEmailSettings } from "@/domain/entities/email-settings";
import { sealEmailSecret } from "@/infrastructure/config/email-secret-crypto";

type Row = {
  organization_id: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password_enc: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  status: string;
  last_tested_at: Date | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  updated_at: Date;
};

const COLUMNS =
  "organization_id, host, port, secure, username, password_enc, from_email, from_name, reply_to, status, last_tested_at, last_test_ok, last_test_error, updated_at";
const PLATFORM_COLUMNS =
  "NULL::uuid AS organization_id, host, port, secure, username, password_enc, from_email, from_name, reply_to, status, last_tested_at, last_test_ok, last_test_error, updated_at";

function toSettings(row: Row, source: "organization" | "platform"): StoredEmailSettings {
  return {
    source,
    organizationId: row.organization_id,
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    passwordEnc: row.password_enc,
    fromEmail: row.from_email,
    fromName: row.from_name,
    replyTo: row.reply_to,
    status: row.status === "disabled" ? "disabled" : "active",
    lastTestedAt: row.last_tested_at?.toISOString() ?? null,
    lastTestOk: row.last_test_ok,
    lastTestError: row.last_test_error,
    updatedAt: row.updated_at.toISOString(),
  };
}

export function pgEmailSettingsRepository(pool: Pool): EmailSettingsRepository {
  return {
    async findOrganization(organizationId) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM organization_email_settings WHERE organization_id = $1`,
        [organizationId],
      );
      return rows[0] ? toSettings(rows[0], "organization") : null;
    },
    async findPlatform() {
      const { rows } = await pool.query<Row>(
        `SELECT ${PLATFORM_COLUMNS} FROM platform_email_settings WHERE id = 'default'`,
      );
      return rows[0] ? toSettings(rows[0], "platform") : null;
    },
    async upsertOrganization(organizationId, input, actorId) {
      const current = await this.findOrganization(organizationId);
      const passwordEnc = input.password
        ? sealEmailSecret(`org:${organizationId}`, input.password)
        : (current?.passwordEnc ?? "");
      const { rows } = await pool.query<Row>(
        `INSERT INTO organization_email_settings (organization_id, host, port, secure, username, password_enc, from_email, from_name, reply_to, status, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (organization_id) DO UPDATE SET
           host = EXCLUDED.host, port = EXCLUDED.port, secure = EXCLUDED.secure,
           username = EXCLUDED.username, password_enc = EXCLUDED.password_enc,
           from_email = EXCLUDED.from_email, from_name = EXCLUDED.from_name,
           reply_to = EXCLUDED.reply_to, status = EXCLUDED.status,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.host.trim(),
          input.port,
          input.secure,
          input.username.trim(),
          passwordEnc,
          input.fromEmail.trim().toLowerCase(),
          input.fromName.trim(),
          input.replyTo.trim().toLowerCase(),
          input.status,
          actorId,
        ],
      );
      return toSettings(rows[0] as Row, "organization");
    },
    async upsertPlatform(input, actorId) {
      const current = await this.findPlatform();
      const passwordEnc = input.password
        ? sealEmailSecret("platform", input.password)
        : (current?.passwordEnc ?? "");
      const { rows } = await pool.query<Row>(
        `INSERT INTO platform_email_settings (id, host, port, secure, username, password_enc, from_email, from_name, reply_to, status, updated_by)
         VALUES ('default',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           host = EXCLUDED.host, port = EXCLUDED.port, secure = EXCLUDED.secure,
           username = EXCLUDED.username, password_enc = EXCLUDED.password_enc,
           from_email = EXCLUDED.from_email, from_name = EXCLUDED.from_name,
           reply_to = EXCLUDED.reply_to, status = EXCLUDED.status,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING ${PLATFORM_COLUMNS}`,
        [
          input.host.trim(),
          input.port,
          input.secure,
          input.username.trim(),
          passwordEnc,
          input.fromEmail.trim().toLowerCase(),
          input.fromName.trim(),
          input.replyTo.trim().toLowerCase(),
          input.status,
          actorId,
        ],
      );
      return toSettings(rows[0] as Row, "platform");
    },
    async recordTest(organizationId, ok, error) {
      const table =
        organizationId === null ? "platform_email_settings" : "organization_email_settings";
      const where = organizationId === null ? "id = 'default'" : "organization_id = $3";
      await pool.query(
        `UPDATE ${table} SET last_tested_at = now(), last_test_ok = $1, last_test_error = $2, updated_at = now() WHERE ${where}`,
        organizationId === null ? [ok, error] : [ok, error, organizationId],
      );
    },
  };
}
