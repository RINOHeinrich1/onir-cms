import type { Pool } from "pg";
import type { ConfidentialiteRepository } from "@/application/ports/confidentialite-repository";
import type { Confidentialite, ConfidentialiteInput } from "@/domain/entities/confidentialite";

type Row = {
  id: string;
  organization_id: string;
  titre: string;
  texte: string;
  lien: string;
  actif: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, titre, texte, lien, actif, created_by, created_at, updated_at";

function toEntity(row: Row): Confidentialite {
  return {
    id: row.id,
    organizationId: row.organization_id,
    titre: row.titre,
    texte: row.texte,
    lien: row.lien,
    actif: row.actif,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `ConfidentialiteRepository` (scopé ADR-0025). */
export function pgConfidentialiteRepository(pool: Pool): ConfidentialiteRepository {
  return {
    async findById(organizationId, id): Promise<Confidentialite | null> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM confidentialites
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findByTitre(organizationId, titre): Promise<Confidentialite | null> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM confidentialites
          WHERE organization_id = $1 AND lower(titre) = lower($2)`,
        [organizationId, titre],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async list(organizationId): Promise<Confidentialite[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM confidentialites
          WHERE organization_id = $1
          ORDER BY lower(titre)`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async listActives(organizationId): Promise<Confidentialite[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM confidentialites
          WHERE organization_id = $1 AND actif
          ORDER BY lower(titre)`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async create(
      organizationId,
      input: ConfidentialiteInput & { createdBy: string | null },
    ): Promise<Confidentialite> {
      const { rows } = await pool.query<Row>(
        `INSERT INTO confidentialites (organization_id, titre, texte, lien, actif, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
        [organizationId, input.titre, input.texte, input.lien, input.actif, input.createdBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la politique de confidentialité");
      return toEntity(row);
    },

    async update(
      organizationId,
      id,
      patch: Partial<ConfidentialiteInput>,
    ): Promise<Confidentialite | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (patch.titre !== undefined) push("titre", patch.titre);
      if (patch.texte !== undefined) push("texte", patch.texte);
      if (patch.lien !== undefined) push("lien", patch.lien);
      if (patch.actif !== undefined) push("actif", patch.actif);
      if (sets.length === 0) return this.findById(organizationId, id);
      push("updated_at", new Date());
      values.push(organizationId, id);
      const { rows } = await pool.query<Row>(
        `UPDATE confidentialites SET ${sets.join(", ")}
          WHERE organization_id = $${values.length - 1} AND id = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async delete(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM confidentialites WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
