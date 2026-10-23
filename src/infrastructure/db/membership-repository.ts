import type { Pool } from "pg";
import type {
  MembershipRepository,
  UpsertMembershipInput,
} from "@/application/ports/membership-repository";
import type { Membership, MembershipRole } from "@/domain/entities/organization";
import { parseRole } from "@/domain/entities/user";

type Row = {
  organization_id: string;
  user_id: string;
  role: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = "organization_id, user_id, role, created_by, created_at, updated_at";

function toEntity(row: Row): Membership {
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    role: parseRole(row.role),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `MembershipRepository` (ADR-0025 §3). */
export function pgMembershipRepository(pool: Pool): MembershipRepository {
  return {
    async findRole(organizationId, userId): Promise<MembershipRole | null> {
      const { rows } = await pool.query<{ role: string }>(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
        [organizationId, userId],
      );
      const row = rows[0];
      return row ? parseRole(row.role) : null;
    },

    async findByOrganizationAndUser(organizationId, userId): Promise<Membership | null> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM organization_members
          WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, userId],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async listForUser(userId): Promise<Membership[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM organization_members
          WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId],
      );
      return rows.map(toEntity);
    },

    async listForOrganization(organizationId): Promise<Membership[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM organization_members
          WHERE organization_id = $1 ORDER BY created_at ASC`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async upsert(input: UpsertMembershipInput): Promise<Membership> {
      const { rows } = await pool.query<Row>(
        `INSERT INTO organization_members (organization_id, user_id, role, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, updated_at = now()
         RETURNING ${COLUMNS}`,
        [input.organizationId, input.userId, input.role, input.createdBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec d'enregistrement de la membership");
      return toEntity(row);
    },

    async updateRole(organizationId, userId, role): Promise<Membership | null> {
      const { rows } = await pool.query<Row>(
        `UPDATE organization_members SET role = $1, updated_at = now()
          WHERE organization_id = $2 AND user_id = $3
          RETURNING ${COLUMNS}`,
        [role, organizationId, userId],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async remove(organizationId, userId): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2",
        [organizationId, userId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async countAdmins(organizationId): Promise<number> {
      const { rows } = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM organization_members WHERE organization_id = $1 AND role = 'admin'",
        [organizationId],
      );
      return rows[0]?.count ?? 0;
    },

    async countForUser(userId): Promise<number> {
      const { rows } = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM organization_members WHERE user_id = $1",
        [userId],
      );
      return rows[0]?.count ?? 0;
    },
  };
}
