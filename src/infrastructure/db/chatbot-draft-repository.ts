import type { Pool } from "pg";
import type {
  ChatbotDraft,
  ChatbotDraftRepository,
  CreateChatbotDraftInput,
  UpdateChatbotDraftInput,
} from "@/application/ports/chatbot-draft-repository";

type DraftRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  label: string;
  state: unknown;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = "id, organization_id, created_by, label, state, created_at, updated_at";

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toEntity(row: DraftRow): ChatbotDraft {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    label: row.label,
    state: asObject(row.state),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `ChatbotDraftRepository` (scopé organisation). */
export function pgChatbotDraftRepository(pool: Pool): ChatbotDraftRepository {
  return {
    async list(organizationId): Promise<ChatbotDraft[]> {
      const { rows } = await pool.query<DraftRow>(
        `SELECT ${COLUMNS} FROM chatbot_drafts
          WHERE organization_id = $1
          ORDER BY updated_at DESC`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, id): Promise<ChatbotDraft | null> {
      const { rows } = await pool.query<DraftRow>(
        `SELECT ${COLUMNS} FROM chatbot_drafts WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async create(organizationId, input: CreateChatbotDraftInput): Promise<ChatbotDraft> {
      const { rows } = await pool.query<DraftRow>(
        `INSERT INTO chatbot_drafts (organization_id, created_by, label, state)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING ${COLUMNS}`,
        [organizationId, input.createdBy, input.label, JSON.stringify(input.state)],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du brouillon");
      return toEntity(row);
    },

    async update(organizationId, id, input: UpdateChatbotDraftInput): Promise<ChatbotDraft | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown, cast = ""): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}${cast === "" ? "" : `::${cast}`}`);
      };

      if (input.label !== undefined) push("label", input.label);
      if (input.state !== undefined) push("state", JSON.stringify(input.state), "jsonb");
      if (sets.length === 0) return this.findById(organizationId, id);

      values.push(organizationId, id);
      const { rows } = await pool.query<DraftRow>(
        `UPDATE chatbot_drafts
            SET ${sets.join(", ")}, updated_at = now()
          WHERE organization_id = $${values.length - 1} AND id = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async delete(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM chatbot_drafts WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
