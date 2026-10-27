import type { Pool } from "pg";
import type {
  CreateProspectInput,
  ProspectRepository,
  UpdateProspectInput,
} from "@/application/ports/prospect-repository";
import {
  type Prospect,
  type ProspectOriginFilter,
  parseNatureProspect,
  parseOrigineProspect,
} from "@/domain/entities/prospect";

type ProspectRow = {
  id: string;
  organization_id: string;
  nom: string;
  prenom: string;
  nature: string;
  email: string;
  activite: string;
  fonction: string;
  detail: string;
  origine: string;
  link_id: string | null;
  lien_label: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "p.id, p.organization_id, p.nom, p.prenom, p.nature, p.email, p.activite, p.fonction, p.detail, p.origine, p.link_id, p.created_by, p.created_at, p.updated_at";

const RETURNING_COLUMNS =
  "id, organization_id, nom, prenom, nature, email, activite, fonction, detail, origine, link_id, created_by, created_at, updated_at";

function toEntity(row: ProspectRow): Prospect {
  return {
    id: row.id,
    organizationId: row.organization_id,
    nom: row.nom,
    prenom: row.prenom,
    nature: parseNatureProspect(row.nature),
    email: row.email,
    activite: row.activite,
    fonction: row.fonction,
    detail: row.detail,
    origine: parseOrigineProspect(row.origine),
    lienId: row.link_id,
    lienLabel: row.lien_label ?? null,
    contactMissing: row.email.trim() === "",
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `ProspectRepository` (B005, scopé ADR-0025). */
export function pgProspectRepository(pool: Pool): ProspectRepository {
  return {
    async findByEmail(organizationId, email): Promise<Prospect | null> {
      const { rows } = await pool.query<ProspectRow>(
        `SELECT ${COLUMNS}, l.label AS lien_label
           FROM prospects p
           LEFT JOIN chat_links l ON l.id = p.link_id AND l.organization_id = p.organization_id
          WHERE p.organization_id = $1 AND lower(p.email) = lower($2)
          ORDER BY p.created_at ASC
          LIMIT 1`,
        [organizationId, email],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findById(organizationId, id): Promise<Prospect | null> {
      const { rows } = await pool.query<ProspectRow>(
        `SELECT ${COLUMNS}, l.label AS lien_label
           FROM prospects p
           LEFT JOIN chat_links l ON l.id = p.link_id AND l.organization_id = p.organization_id
          WHERE p.organization_id = $1 AND p.id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async list(organizationId, filter: ProspectOriginFilter | null = null): Promise<Prospect[]> {
      const clause =
        filter === null
          ? ""
          : filter.kind === "manuel"
            ? "AND p.origine = 'saisie'"
            : "AND p.origine = 'libre' AND l.label = $2";
      const params = filter?.kind === "lien" ? [organizationId, filter.label] : [organizationId];
      const { rows } = await pool.query<ProspectRow>(
        `SELECT ${COLUMNS}, l.label AS lien_label
           FROM prospects p
           LEFT JOIN chat_links l ON l.id = p.link_id AND l.organization_id = p.organization_id
          WHERE p.organization_id = $1 ${clause}
          ORDER BY p.created_at DESC`,
        params,
      );
      return rows.map((row) => toEntity(row));
    },

    async listLinkLabels(organizationId): Promise<string[]> {
      const { rows } = await pool.query<{ label: string }>(
        `SELECT l.label
           FROM prospects p
           JOIN chat_links l ON l.id = p.link_id AND l.organization_id = p.organization_id
          WHERE p.organization_id = $1 AND p.origine = 'libre'
          GROUP BY l.label
          ORDER BY l.label`,
        [organizationId],
      );
      return rows.map((row) => row.label);
    },

    async create(organizationId, input: CreateProspectInput): Promise<Prospect> {
      const { rows } = await pool.query<ProspectRow>(
        `INSERT INTO prospects (organization_id, nom, prenom, nature, email, activite, fonction, detail, created_by, origine, link_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${RETURNING_COLUMNS}`,
        [
          organizationId,
          input.nom,
          input.prenom,
          input.nature,
          input.email,
          input.activite,
          input.fonction,
          input.detail,
          input.createdBy,
          input.origine ?? "saisie",
          input.lienId ?? null,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du prospect");
      return toEntity(row);
    },

    async update(organizationId, id, patch: UpdateProspectInput): Promise<Prospect | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (patch.nom !== undefined) push("nom", patch.nom);
      if (patch.prenom !== undefined) push("prenom", patch.prenom);
      if (patch.nature !== undefined) push("nature", patch.nature);
      if (patch.email !== undefined) push("email", patch.email);
      if (patch.activite !== undefined) push("activite", patch.activite);
      if (patch.fonction !== undefined) push("fonction", patch.fonction);
      if (patch.detail !== undefined) push("detail", patch.detail);

      if (sets.length === 0) {
        return this.findById(organizationId, id);
      }

      push("updated_at", new Date());
      values.push(organizationId, id);
      const { rows } = await pool.query<ProspectRow>(
        `UPDATE prospects SET ${sets.join(", ")}
          WHERE organization_id = $${values.length - 1} AND id = $${values.length}
          RETURNING ${RETURNING_COLUMNS}`,
        values,
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async delete(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM prospects WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
