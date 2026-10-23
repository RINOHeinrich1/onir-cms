import type { Pool } from "pg";
import type {
  ConnaissanceRepository,
  CreateConnaissanceInput,
  UpdateConnaissanceInput,
} from "@/application/ports/connaissance-repository";
import type { Connaissance } from "@/domain/entities/connaissance";

type ConnaissanceRow = {
  id: string;
  organization_id: string;
  titre: string;
  contenu: string;
  template_keys: string[];
  actif: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, titre, contenu, template_keys, actif, created_by, created_at, updated_at";

function toEntity(row: ConnaissanceRow): Connaissance {
  return {
    id: row.id,
    organizationId: row.organization_id,
    titre: row.titre,
    contenu: row.contenu,
    templateKeys: row.template_keys,
    actif: row.actif,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `ConnaissanceRepository` (scopé ADR-0025). */
export function pgConnaissanceRepository(pool: Pool): ConnaissanceRepository {
  return {
    async findById(organizationId, id): Promise<Connaissance | null> {
      const { rows } = await pool.query<ConnaissanceRow>(
        `SELECT ${COLUMNS} FROM base_connaissances
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findByTitre(organizationId, titre): Promise<Connaissance | null> {
      const { rows } = await pool.query<ConnaissanceRow>(
        `SELECT ${COLUMNS} FROM base_connaissances
          WHERE organization_id = $1 AND lower(titre) = lower($2)`,
        [organizationId, titre],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async list(organizationId): Promise<Connaissance[]> {
      const { rows } = await pool.query<ConnaissanceRow>(
        `SELECT ${COLUMNS} FROM base_connaissances
          WHERE organization_id = $1
          ORDER BY updated_at DESC`,
        [organizationId],
      );
      return rows.map((row) => toEntity(row));
    },

    async listActives(organizationId, templateKey): Promise<Connaissance[]> {
      const { rows } = await pool.query<ConnaissanceRow>(
        `SELECT ${COLUMNS} FROM base_connaissances
         WHERE organization_id = $1 AND actif
           AND (cardinality(template_keys) = 0 OR $2 = ANY(template_keys))
         ORDER BY updated_at DESC`,
        [organizationId, templateKey],
      );
      return rows.map((row) => toEntity(row));
    },

    async create(organizationId, input: CreateConnaissanceInput): Promise<Connaissance> {
      const { rows } = await pool.query<ConnaissanceRow>(
        `INSERT INTO base_connaissances (organization_id, titre, contenu, template_keys, created_by)
         VALUES ($1, $2, $3, $4::text[], $5)
         RETURNING ${COLUMNS}`,
        [organizationId, input.titre, input.contenu, input.templateKeys, input.createdBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de l'entrée");
      return toEntity(row);
    },

    async update(organizationId, id, patch: UpdateConnaissanceInput): Promise<Connaissance | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (patch.titre !== undefined) push("titre", patch.titre);
      if (patch.contenu !== undefined) push("contenu", patch.contenu);
      if (patch.templateKeys !== undefined) push("template_keys", patch.templateKeys);
      if (patch.actif !== undefined) push("actif", patch.actif);

      if (sets.length === 0) {
        return this.findById(organizationId, id);
      }

      push("updated_at", new Date());
      values.push(organizationId, id);
      const { rows } = await pool.query<ConnaissanceRow>(
        `UPDATE base_connaissances SET ${sets.join(", ")}
          WHERE organization_id = $${values.length - 1} AND id = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async delete(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM base_connaissances WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
