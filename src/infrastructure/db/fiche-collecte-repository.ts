import type { Pool, PoolClient } from "pg";
import type {
  FicheCollecteRepository,
  FicheCollecteVersion,
} from "@/application/ports/fiche-collecte-repository";
import type { TemplateField } from "@/domain/entities/chat-template";
import type { FicheCollecte, FicheCollecteInput } from "@/domain/entities/fiche-collecte";

type Row = {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  description: string;
  intent: string;
  fields: unknown;
  render_template: string;
  instructions: string;
  version: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type VersionRow = {
  id: string;
  fiche_collecte_id: string;
  version: number;
  key: string;
  label: string;
  description: string;
  intent: string;
  fields: unknown;
  render_template: string;
  instructions: string;
  created_by: string | null;
  created_at: Date;
};

const COLUMNS =
  "id, organization_id, key, label, description, intent, fields, render_template, instructions, version, created_by, created_at, updated_at";
function parseFields(value: unknown): TemplateField[] {
  return Array.isArray(value) ? (value as TemplateField[]) : [];
}

function toEntity(row: Row): FicheCollecte {
  return {
    id: row.id,
    organizationId: row.organization_id,
    key: row.key,
    label: row.label,
    description: row.description,
    intent: row.intent,
    fields: parseFields(row.fields),
    renderTemplate: row.render_template,
    instructions: row.instructions,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toVersion(row: VersionRow): FicheCollecteVersion {
  return {
    id: row.id,
    ficheCollecteId: row.fiche_collecte_id,
    version: row.version,
    key: row.key,
    label: row.label,
    description: row.description,
    intent: row.intent,
    fields: parseFields(row.fields),
    renderTemplate: row.render_template,
    instructions: row.instructions,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

async function insertVersion(
  client: PoolClient,
  ficheId: string,
  version: number,
  input: FicheCollecteInput,
  createdBy: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO fiche_collecte_versions
       (fiche_collecte_id, version, key, label, description, intent, fields,
        render_template, instructions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
    [
      ficheId,
      version,
      input.key,
      input.label,
      input.description,
      input.intent,
      JSON.stringify(input.fields),
      input.renderTemplate,
      input.instructions,
      createdBy,
    ],
  );
}

/** Adapter PostgreSQL des fiches de collecte réutilisables (ADR-0049). */
export function pgFicheCollecteRepository(pool: Pool): FicheCollecteRepository {
  return {
    async list(organizationId) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM fiche_collectes
          WHERE organization_id = $1
          ORDER BY lower(label), key`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM fiche_collectes
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async findByKey(organizationId, key) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM fiche_collectes
          WHERE organization_id = $1 AND key = $2`,
        [organizationId, key],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async create(organizationId, input, createdBy) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<Row>(
          `INSERT INTO fiche_collectes
             (organization_id, key, label, description, intent, fields,
              render_template, instructions, version, created_by)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 1, $9)
           RETURNING ${COLUMNS}`,
          [
            organizationId,
            input.key,
            input.label,
            input.description,
            input.intent,
            JSON.stringify(input.fields),
            input.renderTemplate,
            input.instructions,
            createdBy,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Échec de création de la fiche de collecte");
        await insertVersion(client, row.id, 1, input, createdBy);
        await client.query("COMMIT");
        return toEntity(row);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateVersion(organizationId, id, input, createdBy) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{ version: number }>(
          `SELECT version FROM fiche_collectes
            WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [organizationId, id],
        );
        const currentVersion = current.rows[0]?.version;
        if (currentVersion === undefined) {
          await client.query("ROLLBACK");
          return null;
        }
        const version = currentVersion + 1;
        const updated = await client.query<Row>(
          `UPDATE fiche_collectes SET
             key = $3, label = $4, description = $5, intent = $6, fields = $7::jsonb,
             render_template = $8, instructions = $9, version = $10, updated_at = now()
           WHERE organization_id = $1 AND id = $2
           RETURNING ${COLUMNS}`,
          [
            organizationId,
            id,
            input.key,
            input.label,
            input.description,
            input.intent,
            JSON.stringify(input.fields),
            input.renderTemplate,
            input.instructions,
            version,
          ],
        );
        await insertVersion(client, id, version, input, createdBy);
        await client.query("COMMIT");
        const row = updated.rows[0];
        return row ? toEntity(row) : null;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listVersions(organizationId, id) {
      const { rows } = await pool.query<VersionRow>(
        `SELECT v.id, v.fiche_collecte_id, v.version, v.key, v.label, v.description,
                v.intent, v.fields, v.render_template, v.instructions,
                v.created_by, v.created_at
           FROM fiche_collecte_versions v
           JOIN fiche_collectes f ON f.id = v.fiche_collecte_id
          WHERE f.organization_id = $1 AND v.fiche_collecte_id = $2
          ORDER BY v.version DESC`,
        [organizationId, id],
      );
      return rows.map(toVersion);
    },

    async findVersion(organizationId, id, version) {
      const { rows } = await pool.query<VersionRow>(
        `SELECT v.id, v.fiche_collecte_id, v.version, v.key, v.label, v.description,
                v.intent, v.fields, v.render_template, v.instructions,
                v.created_by, v.created_at
           FROM fiche_collecte_versions v
           JOIN fiche_collectes f ON f.id = v.fiche_collecte_id
          WHERE f.organization_id = $1 AND v.fiche_collecte_id = $2 AND v.version = $3`,
        [organizationId, id, version],
      );
      return rows[0] ? toVersion(rows[0]) : null;
    },

    async delete(organizationId, id) {
      const result = await pool.query(
        "DELETE FROM fiche_collectes WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
