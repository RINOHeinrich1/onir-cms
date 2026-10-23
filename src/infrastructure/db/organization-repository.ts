import type { Pool } from "pg";
import type {
  CreateOrganizationInput,
  OrganizationRepository,
} from "@/application/ports/organization-repository";
import type { Organization } from "@/domain/entities/organization";
import { provisionOrganizationDefaults } from "./tenant-provisioning";

type Row = {
  id: string;
  name: string;
  suspended_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = "id, name, suspended_at, created_by, created_at, updated_at";

function toEntity(row: Row): Organization {
  return {
    id: row.id,
    name: row.name,
    suspendedAt: row.suspended_at ? row.suspended_at.toISOString() : null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `OrganizationRepository` (ADR-0025). */
export function pgOrganizationRepository(pool: Pool): OrganizationRepository {
  return {
    async create(input: CreateOrganizationInput): Promise<Organization> {
      const { rows } = await pool.query<Row>(
        `INSERT INTO organizations (name, created_by)
         VALUES ($1, $2) RETURNING ${COLUMNS}`,
        [input.name, input.createdBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de l'organisation");
      return toEntity(row);
    },

    async findById(id): Promise<Organization | null> {
      const { rows } = await pool.query<Row>(`SELECT ${COLUMNS} FROM organizations WHERE id = $1`, [
        id,
      ]);
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findByName(name): Promise<Organization | null> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM organizations WHERE lower(name) = lower($1)`,
        [name],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async listAll(): Promise<Organization[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM organizations ORDER BY lower(name)`,
      );
      return rows.map(toEntity);
    },

    async listForUser(userId): Promise<Organization[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS.split(", ")
          .map((c) => `o.${c}`)
          .join(", ")}
           FROM organizations o
           JOIN organization_members m ON m.organization_id = o.id
          WHERE m.user_id = $1
          ORDER BY lower(o.name)`,
        [userId],
      );
      return rows.map(toEntity);
    },

    async rename(id, name): Promise<Organization | null> {
      const { rows } = await pool.query<Row>(
        `UPDATE organizations SET name = $1, updated_at = now()
          WHERE id = $2 RETURNING ${COLUMNS}`,
        [name, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async setSuspended(id, suspended): Promise<Organization | null> {
      const { rows } = await pool.query<Row>(
        `UPDATE organizations
            SET suspended_at = CASE WHEN $1 THEN now() ELSE NULL END,
                updated_at = now()
          WHERE id = $2 RETURNING ${COLUMNS}`,
        [suspended, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async provisionDefaults(organizationId): Promise<void> {
      await provisionOrganizationDefaults(pool, organizationId);
    },
  };
}
