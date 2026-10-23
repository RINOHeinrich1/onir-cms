import type { Pool } from "pg";
import type {
  CreateSessionInput,
  Session,
  SessionRepository,
  SessionWithUser,
} from "@/application/ports/session-repository";
import type { Organization } from "@/domain/entities/organization";

export type { Session } from "@/application/ports/session-repository";

import { parseRole, type User } from "@/domain/entities/user";

export type SessionRow = {
  id: string;
  token_hash: string;
  user_id: string;
  active_organization_id: string | null;
  expires_at: Date;
  created_at: Date;
};

export type SessionWithUserRow = {
  session_id: string;
  token_hash: string;
  user_id: string;
  active_organization_id: string | null;
  expires_at: Date;
  session_created_at: Date;
  user_email: string;
  role: string;
  is_super_admin: boolean;
  last_active_organization_id: string | null;
  must_change_password: boolean;
  actif: boolean;
  user_created_at: Date;
  user_updated_at: Date;
  org_id: string | null;
  org_name: string | null;
  org_suspended_at: Date | null;
  org_created_by: string | null;
  org_created_at: Date | null;
  org_updated_at: Date | null;
};

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    userId: row.user_id,
    activeOrganizationId: row.active_organization_id,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function toUser(row: SessionWithUserRow): User {
  return {
    id: row.user_id,
    email: row.user_email,
    role: parseRole(row.role),
    isSuperAdmin: row.is_super_admin,
    lastActiveOrganizationId: row.last_active_organization_id,
    mustChangePassword: row.must_change_password,
    actif: row.actif,
    createdAt: row.user_created_at.toISOString(),
    updatedAt: row.user_updated_at.toISOString(),
  };
}

function toOrganization(row: SessionWithUserRow): Organization | null {
  if (row.org_id === null || row.org_name === null) return null;
  return {
    id: row.org_id,
    name: row.org_name,
    suspendedAt: row.org_suspended_at ? row.org_suspended_at.toISOString() : null,
    createdBy: row.org_created_by,
    createdAt: (row.org_created_at ?? new Date(0)).toISOString(),
    updatedAt: (row.org_updated_at ?? new Date(0)).toISOString(),
  };
}

/** Adapter PostgreSQL du port `SessionRepository` (A023, étendu ADR-0025). */
export function pgSessionRepository(pool: Pool): SessionRepository {
  return {
    async create(input: CreateSessionInput): Promise<Session> {
      const { rows } = await pool.query<SessionRow>(
        `INSERT INTO sessions (token_hash, user_id, active_organization_id, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, token_hash, user_id, active_organization_id, expires_at, created_at`,
        [input.tokenHash, input.userId, input.activeOrganizationId, input.expiresAt],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la session");
      return toSession(row);
    },

    async findByTokenHash(tokenHash): Promise<SessionWithUser | null> {
      const { rows } = await pool.query<SessionWithUserRow>(
        `SELECT s.id AS session_id, s.token_hash, s.user_id, s.active_organization_id,
                s.expires_at, s.created_at AS session_created_at,
                u.email AS user_email, u.role, u.is_super_admin,
                u.last_active_organization_id, u.must_change_password, u.actif,
                u.created_at AS user_created_at, u.updated_at AS user_updated_at,
                o.id AS org_id, o.name AS org_name, o.suspended_at AS org_suspended_at,
                o.created_by AS org_created_by, o.created_at AS org_created_at,
                o.updated_at AS org_updated_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN organizations o ON o.id = s.active_organization_id
         WHERE s.token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) return null;
      const session: Session = {
        id: row.session_id,
        tokenHash: row.token_hash,
        userId: row.user_id,
        activeOrganizationId: row.active_organization_id,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.session_created_at.toISOString(),
      };
      return { session, user: toUser(row), organization: toOrganization(row) };
    },

    async setActiveOrganization(sessionId, organizationId): Promise<void> {
      await pool.query("UPDATE sessions SET active_organization_id = $1 WHERE id = $2", [
        organizationId,
        sessionId,
      ]);
    },

    async delete(tokenHash): Promise<void> {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },

    async deleteByUser(userId): Promise<void> {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    },
  };
}
