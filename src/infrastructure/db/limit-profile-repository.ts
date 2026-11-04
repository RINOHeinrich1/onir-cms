import type { Pool } from "pg";
import type {
  CreateLimitProfileInput,
  LimitProfile,
  LimitProfileRepository,
  UpdateLimitProfileInput,
} from "@/application/ports/limit-profile-repository";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";
import {
  applyLimitProfileToOrganization,
  syncLimitProfileToOrganizations,
} from "./limit-profile-sync";

type OfferRow = {
  id: string;
  name: string;
  description: string;
  provisioning: unknown;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = "id, name, description, provisioning, active, created_at, updated_at";

function toOffer(row: OfferRow): LimitProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provisioning: row.provisioning as OrganizationProvisioning,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL des offres réutilisables (ADR-0065). */
export function pgLimitProfileRepository(pool: Pool): LimitProfileRepository {
  return {
    async list(includeInactive = false): Promise<LimitProfile[]> {
      const { rows } = await pool.query<OfferRow>(
        `SELECT ${COLUMNS} FROM limit_profiles
          ${includeInactive ? "" : "WHERE active = true"}
          ORDER BY lower(name)`,
      );
      return rows.map(toOffer);
    },

    async findById(id: string): Promise<LimitProfile | null> {
      const { rows } = await pool.query<OfferRow>(
        `SELECT ${COLUMNS} FROM limit_profiles WHERE id = $1`,
        [id],
      );
      return rows[0] ? toOffer(rows[0]) : null;
    },

    async create(input: CreateLimitProfileInput): Promise<LimitProfile> {
      const { rows } = await pool.query<OfferRow>(
        `INSERT INTO limit_profiles
           (name, description, provisioning, active, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${COLUMNS}`,
        [
          input.name,
          input.description,
          JSON.stringify(input.provisioning),
          input.active,
          input.createdBy,
        ],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Échec de création de l'offre");
      return toOffer(row);
    },

    async update(id: string, input: UpdateLimitProfileInput): Promise<LimitProfile | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (input.name !== undefined) push("name", input.name);
      if (input.description !== undefined) push("description", input.description);
      if (input.provisioning !== undefined)
        push("provisioning", JSON.stringify(input.provisioning));
      if (input.active !== undefined) push("active", input.active);
      if (sets.length === 0) return this.findById(id);
      values.push(id);
      const { rows } = await pool.query<OfferRow>(
        `UPDATE limit_profiles SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      return rows[0] ? toOffer(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      const result = await pool.query("DELETE FROM limit_profiles WHERE id = $1", [id]);
      return (result.rowCount ?? 0) > 0;
    },

    async syncToOrganizations(profile: LimitProfile, appliedBy: string): Promise<void> {
      await syncLimitProfileToOrganizations(pool, profile, appliedBy);
    },

    async applyToOrganization(
      organizationId: string,
      profileId: string,
      appliedBy: string,
    ): Promise<LimitProfile | null> {
      const profile = await this.findById(profileId);
      if (profile === null) return null;
      await applyLimitProfileToOrganization(pool, organizationId, profile, appliedBy);
      return profile;
    },
  };
}
