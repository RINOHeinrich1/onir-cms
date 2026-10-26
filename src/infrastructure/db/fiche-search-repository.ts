import type { Pool } from "pg";
import type {
  FicheSearchCriteria,
  FicheSearchRepository,
  FicheSearchResult,
} from "@/application/ports/fiche-search-repository";
import { type Fiche, isStatutFiche, type StatutFiche } from "@/domain/entities/fiche";

type FicheRow = {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  prospect_id: string | null;
  created_by: string | null;
  template_key: string;
  template_version: number;
  data: unknown;
  plateformes: string[];
  description: string;
  budget: string;
  duree: string;
  contact: string;
  statut: string | null;
  contraintes_techno: string;
  lien_doc_spec: string;
  archivee: boolean;
  created_at: Date;
};

const COLUMNS = `f.id, f.organization_id, f.conversation_id, f.prospect_id, f.created_by,
  f.template_key, f.template_version, f.data, f.plateformes, f.description,
  f.budget, f.duree, f.contact, f.statut, f.contraintes_techno, f.lien_doc_spec,
  f.archivee, f.created_at`;

function toFiche(row: FicheRow): Fiche {
  const statut: StatutFiche | null =
    row.statut !== null && isStatutFiche(row.statut) ? row.statut : null;
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
    templateKey: row.template_key,
    templateVersion: row.template_version,
    data,
    plateformes: row.plateformes,
    description: row.description,
    budget: row.budget,
    duree: row.duree,
    contact: row.contact,
    statut,
    contraintesTechno: row.contraintes_techno,
    lienDocSpec: row.lien_doc_spec,
    archivee: row.archivee,
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
      if (criteria.templateKey !== null) {
        where.push(`f.template_key = ${add(criteria.templateKey)}`);
      }
      if (criteria.templateVersion !== null) {
        where.push(`f.template_version = ${add(criteria.templateVersion)}`);
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
