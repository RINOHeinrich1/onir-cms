import type { Pool } from "pg";
import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
  CreateInvitationInput,
  InvitationRecord,
  InvitationRepository,
} from "@/application/ports/invitation-repository";
import { normalizeEmail, parseRole, type Role } from "@/domain/entities/user";
import { hashPassword, verifyPassword } from "@/domain/password";
import { decryptLinkToken } from "@/lib/link-crypto";
import { provisionOrganizationDefaultsWithClient } from "./tenant-provisioning";

type InvitationRow = {
  id: string;
  token_hash: string;
  token_enc: string;
  organization_id: string | null;
  role: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  accepted_by: string | null;
  accepted_email: string | null;
  accepted_name: string | null;
  revoked_at: Date | null;
  created_at: Date;
  organization_name: string | null;
  invited_by_email: string;
};

type UserRow = {
  id: string;
  password_hash: string;
  role: string;
  is_super_admin: boolean;
  must_change_password: boolean;
  actif: boolean;
  name: string | null;
};

const INVITATION_COLUMNS = `
  i.id, i.token_hash, i.token_enc, i.organization_id, i.role, i.invited_by,
  i.expires_at, i.accepted_at, i.accepted_by, i.accepted_email, i.accepted_name,
  i.revoked_at, i.created_at,
  o.name AS organization_name,
  u.email AS invited_by_email`;

function decryptToken(tokenEnc: string): string | null {
  try {
    return decryptLinkToken(tokenEnc);
  } catch {
    return null;
  }
}

function toRecord(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    role: parseRole(row.role),
    invitedBy: row.invited_by,
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
    acceptedBy: row.accepted_by,
    acceptedEmail: row.accepted_email,
    acceptedName: row.accepted_name,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    organizationName: row.organization_name,
    invitedByEmail: row.invited_by_email,
    token: decryptToken(row.token_enc),
  };
}

function personalOrganizationBaseName(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "Nouvelle organisation" : trimmed.slice(0, 120);
}

async function insertPersonalOrganization(
  client: import("pg").PoolClient,
  baseName: string,
  userId: string,
): Promise<{ id: string; name: string }> {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const suffix = attempt === 1 ? "" : ` (${attempt})`;
    const candidate = `${baseName.slice(0, 120 - suffix.length)}${suffix}`;
    const inserted = await client.query<{ id: string; name: string }>(
      `INSERT INTO organizations (name, created_by)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id, name`,
      [candidate, userId],
    );
    const row = inserted.rows[0];
    if (row !== undefined) return row;
  }
  throw new Error("Impossible de nommer l'organisation personnelle");
}

export function pgInvitationRepository(pool: Pool): InvitationRepository {
  return {
    async create(input: CreateInvitationInput): Promise<InvitationRecord> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO organization_invitations
           (token_hash, token_enc, organization_id, role, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          input.tokenHash,
          input.tokenEnc,
          input.organizationId,
          input.role,
          input.invitedBy,
          input.expiresAt,
        ],
      );
      const created = rows[0];
      if (created === undefined) throw new Error("Échec de création de l'invitation");
      const record = await this.findById(created.id);
      if (record === null) throw new Error("Invitation introuvable après création");
      return record;
    },

    async findById(id: string): Promise<InvitationRecord | null> {
      const { rows } = await pool.query<InvitationRow>(
        `SELECT ${INVITATION_COLUMNS}
           FROM organization_invitations i
           LEFT JOIN organizations o ON o.id = i.organization_id
           JOIN users u ON u.id = i.invited_by
          WHERE i.id = $1`,
        [id],
      );
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
      const { rows } = await pool.query<InvitationRow>(
        `SELECT ${INVITATION_COLUMNS}
           FROM organization_invitations i
           LEFT JOIN organizations o ON o.id = i.organization_id
           JOIN users u ON u.id = i.invited_by
          WHERE i.token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async listForOrganization(organizationId: string): Promise<InvitationRecord[]> {
      const { rows } = await pool.query<InvitationRow>(
        `SELECT ${INVITATION_COLUMNS}
           FROM organization_invitations i
           LEFT JOIN organizations o ON o.id = i.organization_id
           JOIN users u ON u.id = i.invited_by
          WHERE i.organization_id = $1
          ORDER BY i.created_at DESC`,
        [organizationId],
      );
      return rows.map(toRecord);
    },

    async listAll(): Promise<InvitationRecord[]> {
      const { rows } = await pool.query<InvitationRow>(
        `SELECT ${INVITATION_COLUMNS}
           FROM organization_invitations i
           LEFT JOIN organizations o ON o.id = i.organization_id
           JOIN users u ON u.id = i.invited_by
          ORDER BY i.created_at DESC`,
      );
      return rows.map(toRecord);
    },

    async revoke(id: string): Promise<boolean> {
      const result = await pool.query(
        `UPDATE organization_invitations
            SET revoked_at = now()
          WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async accept(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const invitationRows = await client.query<InvitationRow>(
          `SELECT ${INVITATION_COLUMNS}
             FROM organization_invitations i
             LEFT JOIN organizations o ON o.id = i.organization_id
             JOIN users u ON u.id = i.invited_by
            WHERE i.token_hash = $1
            FOR UPDATE OF i`,
          [input.tokenHash],
        );
        const invitation = invitationRows.rows[0];
        if (invitation === undefined) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "invalid" };
        }
        if (invitation.accepted_at !== null) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "already_accepted" };
        }
        if (invitation.revoked_at !== null) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "revoked" };
        }
        if (invitation.expires_at.getTime() <= Date.now()) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "expired" };
        }

        const email = normalizeEmail(input.email);
        const existing = await client.query<UserRow>(
          `SELECT id, password_hash, role, is_super_admin, must_change_password, actif, name
             FROM users WHERE lower(email) = lower($1) FOR UPDATE`,
          [email],
        );
        let userId: string;
        let mustChangePassword = false;

        const found = existing.rows[0];
        if (found !== undefined) {
          if (!verifyPassword(input.password, found.password_hash)) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "invalid_credentials" };
          }
          if (!found.actif) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "inactive" };
          }
          userId = found.id;
          mustChangePassword = found.must_change_password;
          if (found.name === null && input.name.trim() !== "") {
            await client.query("UPDATE users SET name = $1, updated_at = now() WHERE id = $2", [
              input.name.trim(),
              found.id,
            ]);
          }
        } else {
          const created = await client.query<{ id: string }>(
            `INSERT INTO users (email, password_hash, role, name, must_change_password, actif)
             VALUES ($1, $2, $3, $4, false, true)
             RETURNING id`,
            [email, hashPassword(input.password), invitation.role, input.name.trim()],
          );
          const row = created.rows[0];
          if (row === undefined) throw new Error("Échec de création du compte");
          userId = row.id;
        }

        let organizationId: string;
        let organizationName: string;
        let effectiveRole: Role;

        if (invitation.organization_id === null) {
          const organization = await insertPersonalOrganization(
            client,
            personalOrganizationBaseName(input.name),
            userId,
          );
          organizationId = organization.id;
          organizationName = organization.name;
          effectiveRole = "admin";
        } else {
          const organizationRows = await client.query<{
            id: string;
            name: string;
            suspended_at: Date | null;
          }>("SELECT id, name, suspended_at FROM organizations WHERE id = $1 FOR UPDATE", [
            invitation.organization_id,
          ]);
          const organization = organizationRows.rows[0];
          if (organization === undefined) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "invalid" };
          }
          if (organization.suspended_at !== null) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "organization_suspended" };
          }
          const member = await client.query(
            "SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2",
            [organization.id, userId],
          );
          if ((member.rowCount ?? 0) > 0) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "already_member" };
          }
          organizationId = organization.id;
          organizationName = organization.name;
          effectiveRole = parseRole(invitation.role);
        }

        await client.query(
          `INSERT INTO organization_members (organization_id, user_id, role, created_by)
           VALUES ($1, $2, $3, $4)`,
          [organizationId, userId, effectiveRole, invitation.invited_by],
        );

        if (invitation.organization_id === null) {
          await provisionOrganizationDefaultsWithClient(client, organizationId);
        }

        await client.query(
          `UPDATE users
              SET role = $1, last_active_organization_id = $2, updated_at = now()
            WHERE id = $3`,
          [effectiveRole, organizationId, userId],
        );

        await client.query(
          `UPDATE organization_invitations
              SET accepted_at = now(), accepted_by = $1, accepted_email = $2, accepted_name = $3
            WHERE id = $4`,
          [userId, email, input.name.trim(), invitation.id],
        );

        await client.query("COMMIT");
        return {
          ok: true,
          invitationId: invitation.id,
          userId,
          organizationId,
          organizationName,
          role: effectiveRole,
          mustChangePassword,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
