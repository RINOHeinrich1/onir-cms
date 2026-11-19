import type { Pool } from "pg";
import type { OtpChallengeRepository } from "@/application/ports/otp-challenge-repository";
import type { CreateOtpChallengeInput, OtpChallenge } from "@/domain/entities/otp";

type Row = {
  id: string;
  organization_id: string;
  link_id: string;
  channel: string;
  surface: string;
  email: string;
  email_hash: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  max_attempts: number;
  consentement: boolean;
  consumed_at: Date | null;
  ip: string;
  user_agent: string;
  created_at: Date;
};

const COLUMNS =
  "id, organization_id, link_id, channel, surface, email, email_hash, code_hash, expires_at, attempts, max_attempts, consentement, consumed_at, ip, user_agent, created_at";

function toChallenge(row: Row): OtpChallenge {
  return {
    id: row.id,
    organizationId: row.organization_id,
    linkId: row.link_id,
    channel: row.channel === "widget" ? "widget" : "page",
    surface: row.surface === "widget" ? "widget" : "page",
    email: row.email,
    emailHash: row.email_hash,
    codeHash: row.code_hash,
    expiresAt: row.expires_at.toISOString(),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    consentement: row.consentement,
    consumedAt: row.consumed_at?.toISOString() ?? null,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at.toISOString(),
  };
}

export function pgOtpChallengeRepository(pool: Pool): OtpChallengeRepository {
  return {
    async create(input: CreateOtpChallengeInput) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO chat_otp_challenges (organization_id, link_id, channel, surface, email, email_hash, code_hash, expires_at, max_attempts, consentement, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${COLUMNS}`,
        [
          input.organizationId,
          input.linkId,
          input.channel,
          input.surface,
          input.email,
          input.emailHash,
          input.codeHash,
          input.expiresAt,
          input.maxAttempts,
          input.consentement,
          input.ip,
          input.userAgent,
        ],
      );
      return toChallenge(rows[0] as Row);
    },
    async findById(id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM chat_otp_challenges WHERE id = $1`,
        [id],
      );
      return rows[0] ? toChallenge(rows[0]) : null;
    },
    async countRecentByEmail(emailHash, since) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM chat_otp_challenges WHERE email_hash = $1 AND created_at >= $2`,
        [emailHash, since],
      );
      return Number(rows[0]?.count ?? 0);
    },
    async countRecentByLink(linkId, since) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM chat_otp_challenges WHERE link_id = $1 AND created_at >= $2`,
        [linkId, since],
      );
      return Number(rows[0]?.count ?? 0);
    },
    async countRecentByIp(ip, since) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM chat_otp_challenges WHERE ip = $1 AND created_at >= $2`,
        [ip, since],
      );
      return Number(rows[0]?.count ?? 0);
    },
    async incrementAttempts(id) {
      const { rows } = await pool.query<{ attempts: number }>(
        `UPDATE chat_otp_challenges SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
        [id],
      );
      return rows[0]?.attempts ?? 0;
    },
    async consume(id, codeHash) {
      const { rows } = await pool.query<Row>(
        `UPDATE chat_otp_challenges SET consumed_at = now() WHERE id = $1 AND code_hash = $2 AND consumed_at IS NULL AND expires_at > now() AND attempts < max_attempts RETURNING ${COLUMNS}`,
        [id, codeHash],
      );
      return rows[0] ? toChallenge(rows[0]) : null;
    },
    async purgeExpired(now) {
      const result = await pool.query(
        `DELETE FROM chat_otp_challenges WHERE expires_at < $1 OR consumed_at < $1`,
        [now],
      );
      return result.rowCount ?? 0;
    },
  };
}
