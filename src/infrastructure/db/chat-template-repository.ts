import type { Pool, PoolClient } from "pg";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type {
  ChatTemplate,
  ChatTemplateVersion,
  TemplateDefinition,
} from "@/domain/entities/chat-template";

type TemplateRow = {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  description: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type VersionRow = {
  id: string;
  template_id: string;
  version: number;
  definition: unknown;
  created_by: string | null;
  created_at: Date;
};

const TEMPLATE_COLUMNS =
  "id, organization_id, key, label, description, created_by, created_at, updated_at";
const VERSION_COLUMNS = "id, template_id, version, definition, created_by, created_at";

function toTemplate(row: TemplateRow): ChatTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    key: row.key,
    label: row.label,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toVersion(row: VersionRow): ChatTemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    version: row.version,
    definition: row.definition as TemplateDefinition,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `ChatTemplateRepository` (scopé ADR-0025 §6). */
export function pgChatTemplateRepository(pool: Pool): ChatTemplateRepository {
  return {
    async list(organizationId): Promise<ChatTemplate[]> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS} FROM chat_templates
          WHERE organization_id = $1
          ORDER BY label ASC`,
        [organizationId],
      );
      return rows.map(toTemplate);
    },

    async findByKey(organizationId, key): Promise<ChatTemplate | null> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS} FROM chat_templates
          WHERE organization_id = $1 AND key = $2`,
        [organizationId, key],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async findVersion(organizationId, key, version: number): Promise<ChatTemplateVersion | null> {
      const { rows } = await pool.query<VersionRow>(
        `SELECT v.id, v.template_id, v.version, v.definition, v.created_by, v.created_at
         FROM chat_template_versions v
         JOIN chat_templates t ON t.id = v.template_id
         WHERE t.organization_id = $1 AND t.key = $2 AND v.version = $3`,
        [organizationId, key, version],
      );
      const row = rows[0];
      return row ? toVersion(row) : null;
    },

    async currentVersion(organizationId, key): Promise<ChatTemplateVersion | null> {
      const { rows } = await pool.query<VersionRow>(
        `SELECT v.id, v.template_id, v.version, v.definition, v.created_by, v.created_at
         FROM chat_template_versions v
         JOIN chat_templates t ON t.id = v.template_id
         WHERE t.organization_id = $1 AND t.key = $2
         ORDER BY v.version DESC LIMIT 1`,
        [organizationId, key],
      );
      const row = rows[0];
      return row ? toVersion(row) : null;
    },

    async createTemplate(organizationId, definition, createdBy): Promise<ChatTemplateVersion> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<TemplateRow>(
          `INSERT INTO chat_templates (organization_id, key, label, description, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${TEMPLATE_COLUMNS}`,
          [organizationId, definition.key, definition.label, definition.description, createdBy],
        );
        const template = inserted.rows[0];
        if (!template) throw new Error("Échec de création du modèle");
        const version = await insertVersion(client, template.id, 1, definition, createdBy);
        await client.query("COMMIT");
        return version;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async addVersion(organizationId, key, definition, createdBy): Promise<ChatTemplateVersion> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query<TemplateRow>(
          "SELECT id FROM chat_templates WHERE organization_id = $1 AND key = $2 FOR UPDATE",
          [organizationId, key],
        );
        const template = locked.rows[0];
        if (!template) throw new Error("Modèle introuvable");
        const current = await client.query<{ max: number }>(
          "SELECT COALESCE(MAX(version), 0) AS max FROM chat_template_versions WHERE template_id = $1",
          [template.id],
        );
        const version = await insertVersion(
          client,
          template.id,
          Number(current.rows[0]?.max ?? 0) + 1,
          definition,
          createdBy,
        );
        await client.query("COMMIT");
        return version;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteTemplate(organizationId, key): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM chat_templates WHERE organization_id = $1 AND key = $2",
        [organizationId, key],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listKeysReferencedByLinks(organizationId): Promise<string[]> {
      const { rows } = await pool.query<{ template_key: string }>(
        "SELECT DISTINCT template_key FROM chat_links WHERE organization_id = $1",
        [organizationId],
      );
      return rows.map((row) => row.template_key);
    },

    async listKeysReferencedByFiches(organizationId): Promise<string[]> {
      const { rows } = await pool.query<{ template_key: string }>(
        "SELECT DISTINCT template_key FROM fiches WHERE organization_id = $1",
        [organizationId],
      );
      return rows.map((row) => row.template_key);
    },
  };
}

async function insertVersion(
  client: PoolClient,
  templateId: string,
  version: number,
  definition: TemplateDefinition,
  createdBy: string | null,
): Promise<ChatTemplateVersion> {
  const { rows } = await client.query<VersionRow>(
    `INSERT INTO chat_template_versions (template_id, version, definition, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING ${VERSION_COLUMNS}`,
    [templateId, version, JSON.stringify(definition), createdBy],
  );
  const row = rows[0];
  if (!row) throw new Error("Échec de création de la version");
  return toVersion(row);
}
