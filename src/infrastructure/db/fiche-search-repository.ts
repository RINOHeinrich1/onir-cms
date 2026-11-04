import type { Pool } from "pg";
import type {
  FicheSearchCriteria,
  FicheSearchRepository,
  FicheSearchResult,
} from "@/application/ports/fiche-search-repository";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { Fiche } from "@/domain/entities/fiche";

type FicheRow = {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  prospect_id: string | null;
  created_by: string | null;
  definition: unknown;
  data: unknown;
  archivee: boolean;
  qualification_status_key: string | null;
  qualification_status_updated_at: Date | null;
  qualification_status_updated_by: string | null;
  chat_link_ids: string[];
  created_at: Date;
};

const COLUMNS = `f.id, f.organization_id, f.conversation_id, f.prospect_id, f.created_by,
  f.definition, f.data, f.archivee,
  f.qualification_status_key, f.qualification_status_updated_at,
  f.qualification_status_updated_by, f.created_at,
  (SELECT COALESCE(array_agg(fcl.chat_link_id ORDER BY fcl.created_at), '{}'::uuid[])
     FROM fiche_chat_links fcl WHERE fcl.fiche_id = f.id) AS chat_link_ids`;

function toFiche(row: FicheRow): Fiche {
  const data =
    row.data !== null && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    prospectId: row.prospect_id,
    createdBy: row.created_by,
    definition:
      row.definition !== null &&
      typeof row.definition === "object" &&
      !Array.isArray(row.definition)
        ? (row.definition as TemplateDefinition)
        : null,
    data,
    archivee: row.archivee,
    qualificationStatusKey: row.qualification_status_key,
    qualificationStatusUpdatedAt:
      row.qualification_status_updated_at === null
        ? null
        : row.qualification_status_updated_at.toISOString(),
    qualificationStatusUpdatedBy: row.qualification_status_updated_by,
    chatLinkIds: row.chat_link_ids ?? [],
    createdAt: row.created_at.toISOString(),
  };
}

/** Recherche paginée keyset des fiches, strictement scopée à une organisation. */
export function pgFicheSearchRepository(pool: Pool): FicheSearchRepository {
  return {
    async search(
      organizationId: string,
      criteria: FicheSearchCriteria,
    ): Promise<FicheSearchResult> {
      const where: string[] = ["f.organization_id = $1"];
      const params: unknown[] = [organizationId];
      let index = 2;

      const add = (value: unknown): string => {
        params.push(value);
        const placeholder = `$${index}`;
        index += 1;
        return placeholder;
      };

      if (criteria.q !== null) {
        const p = add(criteria.q);
        where.push(`to_tsvector('simple', f.data::text) @@ websearch_to_tsquery('simple', ${p})`);
      }
      if (criteria.createdFrom !== null) {
        where.push(`f.created_at >= ${add(criteria.createdFrom)}`);
      }
      if (criteria.createdTo !== null) {
        where.push(`f.created_at <= ${add(criteria.createdTo)}`);
      }
      if (criteria.prospectId !== null) {
        where.push(`f.prospect_id = ${add(criteria.prospectId)}`);
      }
      if (criteria.conversationId !== null) {
        where.push(`f.conversation_id = ${add(criteria.conversationId)}`);
      }
      if (criteria.linkId !== null) {
        const p = add(criteria.linkId);
        where.push(`EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = f.conversation_id
            AND c.organization_id = f.organization_id
            AND c.link_id = ${p}
        )`);
      }
      if (!criteria.includeArchived) {
        where.push("f.archivee = false");
      }
      if (criteria.cursor !== null) {
        const createdAt = add(criteria.cursor.createdAt);
        const cursorId = add(criteria.cursor.id);
        const operator = criteria.sort === "desc" ? "<" : ">";
        where.push(`(f.created_at, f.id) ${operator} (${createdAt}, ${cursorId})`);
      }

      const direction = criteria.sort === "desc" ? "DESC" : "ASC";
      const limit = add(criteria.limit + 1);
      const { rows } = await pool.query<FicheRow>(
        `SELECT ${COLUMNS}
           FROM fiches f
          WHERE ${where.join(" AND ")}
          ORDER BY f.created_at ${direction}, f.id ${direction}
          LIMIT ${limit}`,
        params,
      );

      const page = rows.slice(0, criteria.limit);
      const last = page[page.length - 1];
      return {
        fiches: page.map(toFiche),
        nextCursor:
          rows.length > criteria.limit && last !== undefined
            ? { createdAt: last.created_at.toISOString(), id: last.id }
            : null,
      };
    },
  };
}
