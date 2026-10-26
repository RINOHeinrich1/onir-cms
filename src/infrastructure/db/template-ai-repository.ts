/** Écriture transactionnelle d'un modèle assisté par IA et de ses connaissances. */

import type { Pool, PoolClient } from "pg";
import { NotFoundError } from "@/application/errors";
import type {
  ApplyTemplateAiInput,
  ApplyTemplateAiResult,
  TemplateAiRepository,
} from "@/application/ports/template-ai-repository";
import type { ChatTemplateVersion, TemplateDefinition } from "@/domain/entities/chat-template";

type TemplateRow = { id: string };
type VersionRow = {
  id: string;
  template_id: string;
  version: number;
  definition: unknown;
  created_by: string | null;
  created_at: Date;
};

const VERSION_COLUMNS = "id, template_id, version, definition, created_by, created_at";

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

async function writeKnowledge(
  client: PoolClient,
  input: ApplyTemplateAiInput,
  key: string,
): Promise<ApplyTemplateAiResult["knowledge"]> {
  let replaced = 0;
  if (input.mergePolicy === "replace") {
    const deleted = await client.query(
      `DELETE FROM base_connaissances
        WHERE organization_id = $1 AND origin = 'ai' AND source_template_key = $2`,
      [input.organizationId, key],
    );
    replaced = deleted.rowCount ?? 0;
  }

  let created = 0;
  let skipped = 0;
  const conflicts: string[] = [];
  for (const item of input.knowledge) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM base_connaissances
        WHERE organization_id = $1 AND lower(titre) = lower($2)
        LIMIT 1`,
      [input.organizationId, item.titre],
    );
    if ((existing.rowCount ?? 0) > 0) {
      skipped += 1;
      conflicts.push(item.titre);
      continue;
    }
    await client.query(
      `INSERT INTO base_connaissances
         (organization_id, titre, contenu, template_keys, created_by, origin, source_template_key, ai_generation_id)
       VALUES ($1, $2, $3, ARRAY[$4]::text[], $5, 'ai', $4, $6)`,
      [input.organizationId, item.titre, item.contenu, key, input.createdBy, input.generationId],
    );
    created += 1;
  }

  return { created, replaced, skipped, conflicts };
}

export function pgTemplateAiRepository(pool: Pool): TemplateAiRepository {
  return {
    async apply(input: ApplyTemplateAiInput): Promise<ApplyTemplateAiResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let templateId: string;
        let version: ChatTemplateVersion;

        if (input.templateKey === null) {
          const inserted = await client.query<TemplateRow>(
            `INSERT INTO chat_templates (organization_id, key, label, description, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
              input.organizationId,
              input.definition.key,
              input.definition.label,
              input.definition.description,
              input.createdBy,
            ],
          );
          const row = inserted.rows[0];
          if (!row) throw new Error("Échec de création du modèle");
          templateId = row.id;
          version = await insertVersion(client, templateId, 1, input.definition, input.createdBy);
        } else {
          const locked = await client.query<TemplateRow>(
            "SELECT id FROM chat_templates WHERE organization_id = $1 AND key = $2 FOR UPDATE",
            [input.organizationId, input.templateKey],
          );
          const row = locked.rows[0];
          if (!row) throw new NotFoundError("Modèle introuvable");
          templateId = row.id;
          const current = await client.query<{ max: number }>(
            "SELECT COALESCE(MAX(version), 0) AS max FROM chat_template_versions WHERE template_id = $1",
            [templateId],
          );
          version = await insertVersion(
            client,
            templateId,
            Number(current.rows[0]?.max ?? 0) + 1,
            input.definition,
            input.createdBy,
          );
        }

        const knowledge = await writeKnowledge(client, input, input.definition.key);
        await client.query("COMMIT");
        return { version, knowledge };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
