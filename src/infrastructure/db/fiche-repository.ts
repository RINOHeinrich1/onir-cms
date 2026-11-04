import type { Pool } from "pg";
import type { CreateFicheInput, FicheRepository } from "@/application/ports/fiche-repository";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
  type Fiche,
  type FicheArchiveFilter,
  isStatutFiche,
  type StatutFiche,
} from "@/domain/entities/fiche";

type FicheRow = {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  prospect_id: string | null;
  created_by: string | null;
  definition: unknown;
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
  config_id: string | null;
  fiche_key: string | null;
  fiche_instance_key: string | null;
  conversation_fiche_instance_id: string | null;
  qualification_status_key: string | null;
  qualification_status_updated_at: Date | null;
  qualification_status_updated_by: string | null;
  chat_link_ids: string[];
  created_at: Date;
};

const COLUMNS =
  "id, organization_id, conversation_id, prospect_id, created_by, definition, data, plateformes, description, budget, duree, contact, statut, contraintes_techno, lien_doc_spec, archivee, config_id, fiche_key, fiche_instance_key, conversation_fiche_instance_id, qualification_status_key, qualification_status_updated_at, qualification_status_updated_by, created_at, (SELECT COALESCE(array_agg(fcl.chat_link_id ORDER BY fcl.created_at), '{}'::uuid[]) FROM fiche_chat_links fcl WHERE fcl.fiche_id = fiches.id) AS chat_link_ids";

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Dérive les colonnes historiques depuis `data` (compatibilité UI existante) ;
 * lignes vides sinon.
 */
function legacyColumns(data: Record<string, unknown>): {
  plateformes: string[];
  description: string;
  budget: string;
  duree: string;
  contact: string;
  statut: string | null;
  contraintesTechno: string;
  lienDocSpec: string;
} {
  const statutRaw = toText(data.statut);
  return {
    plateformes: toStringList(data.plateformes),
    description: toText(data.description),
    budget: toText(data.budget),
    duree: toText(data.duree),
    contact: toText(data.contact),
    statut: isStatutFiche(statutRaw) ? statutRaw : null,
    contraintesTechno: toText(data.contraintesTechno),
    lienDocSpec: toText(data.lienDocSpec),
  };
}

function toDefinition(value: unknown): TemplateDefinition | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.key !== "string" || typeof record.renderTemplate !== "string") return null;
  if (!Array.isArray(record.fields)) return null;
  return value as TemplateDefinition;
}

function toEntity(row: FicheRow): Fiche {
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
    definition: toDefinition(row.definition),
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
    configId: row.config_id,
    ficheKey: row.fiche_key,
    ficheInstanceKey: row.fiche_instance_key,
    conversationFicheInstanceId: row.conversation_fiche_instance_id,
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

/** Adapter PostgreSQL du port `FicheRepository` (B043, étendu et scopé ADR-0025). */
export function pgFicheRepository(pool: Pool): FicheRepository {
  return {
    async findById(organizationId, id): Promise<Fiche | null> {
      const { rows } = await pool.query<FicheRow>(
        `SELECT ${COLUMNS} FROM fiches WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async listByConversation(organizationId, conversationId): Promise<Fiche[]> {
      const { rows } = await pool.query<FicheRow>(
        `SELECT ${COLUMNS} FROM fiches
          WHERE organization_id = $1 AND conversation_id = $2
          ORDER BY created_at DESC`,
        [organizationId, conversationId],
      );
      return rows.map((row) => toEntity(row));
    },

    async list(
      organizationId,
      filter: FicheArchiveFilter,
      linkLabel: string | string[] | null = null,
      statusKeys: string[] | null = null,
    ): Promise<Fiche[]> {
      const clause =
        filter === "actives"
          ? "AND archivee = false"
          : filter === "archivees"
            ? "AND archivee = true"
            : "";
      const linkLabels =
        linkLabel === null ? null : Array.isArray(linkLabel) ? linkLabel : [linkLabel];
      const linkClause =
        linkLabels === null || linkLabels.length === 0
          ? ""
          : `AND (
               EXISTS (
                 SELECT 1 FROM conversations cv
                 JOIN chat_links l ON l.id = cv.link_id AND l.organization_id = cv.organization_id
                 WHERE cv.id = fiches.conversation_id
                   AND cv.organization_id = fiches.organization_id
                   AND l.label = ANY($2::text[])
               )
               OR EXISTS (
                 SELECT 1 FROM fiche_chat_links fcl
                 JOIN chat_links l ON l.id = fcl.chat_link_id AND l.organization_id = fcl.organization_id
                 WHERE fcl.fiche_id = fiches.id
                   AND fcl.organization_id = fiches.organization_id
                   AND l.label = ANY($2::text[])
               )
             )`;
      const params: unknown[] =
        linkLabels === null || linkLabels.length === 0
          ? [organizationId]
          : [organizationId, linkLabels];
      const normalizedStatuses =
        statusKeys === null || statusKeys.length === 0
          ? null
          : [...new Set(statusKeys.filter((key) => typeof key === "string" && key !== ""))];
      const statusClause =
        normalizedStatuses === null
          ? ""
          : `AND qualification_status_key = ANY($${params.length + 1}::text[])`;
      if (normalizedStatuses !== null) params.push(normalizedStatuses);
      const { rows } = await pool.query<FicheRow>(
        `SELECT ${COLUMNS} FROM fiches
          WHERE organization_id = $1 ${clause} ${linkClause} ${statusClause}
          ORDER BY created_at DESC`,
        params,
      );
      return rows.map((row) => toEntity(row));
    },

    async create(organizationId, input: CreateFicheInput): Promise<Fiche> {
      const legacy = legacyColumns(input.data);
      const chatLinkIds = [...new Set(input.chatLinkIds ?? [])];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO fiches
             (organization_id, conversation_id, prospect_id, created_by, definition, data, plateformes, description, budget, duree, contact, statut, contraintes_techno, lien_doc_spec, config_id, fiche_key, fiche_instance_key, conversation_fiche_instance_id, qualification_status_key, qualification_status_updated_at, qualification_status_updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CASE WHEN $19::text IS NULL THEN NULL ELSE now() END, CASE WHEN $19::text IS NULL THEN NULL ELSE $4::uuid END)
           RETURNING id`,
          [
            organizationId,
            input.conversationId,
            input.prospectId,
            input.createdBy,
            input.definition === undefined || input.definition === null
              ? null
              : JSON.stringify(input.definition),
            JSON.stringify(input.data),
            legacy.plateformes,
            legacy.description,
            legacy.budget,
            legacy.duree,
            legacy.contact,
            legacy.statut,
            legacy.contraintesTechno,
            legacy.lienDocSpec,
            input.configId ?? null,
            input.ficheKey ?? null,
            input.ficheInstanceKey ?? null,
            input.conversationFicheInstanceId ?? null,
            input.qualificationStatusKey ?? null,
          ],
        );
        const id = inserted.rows[0]?.id;
        if (id === undefined) throw new Error("Échec de création de la fiche");
        if (chatLinkIds.length > 0) {
          const links = await client.query<{ id: string }>(
            `SELECT id FROM chat_links
              WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
            [organizationId, chatLinkIds],
          );
          if (links.rowCount !== chatLinkIds.length) {
            throw new Error("Un chatbot associé est introuvable dans cette organisation");
          }
          await client.query(
            `INSERT INTO fiche_chat_links (fiche_id, chat_link_id, organization_id)
             SELECT $1, unnest($2::uuid[]), $3
             ON CONFLICT (fiche_id, chat_link_id) DO NOTHING`,
            [id, chatLinkIds, organizationId],
          );
        }
        const { rows } = await client.query<FicheRow>(
          `SELECT ${COLUMNS} FROM fiches WHERE organization_id = $1 AND id = $2`,
          [organizationId, id],
        );
        const row = rows[0];
        if (row === undefined) throw new Error("Fiche créée introuvable");
        await client.query("COMMIT");
        return toEntity(row);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async findByInstance(organizationId, conversationFicheInstanceId): Promise<Fiche | null> {
      const { rows } = await pool.query<FicheRow>(
        `SELECT ${COLUMNS} FROM fiches
          WHERE organization_id = $1 AND conversation_fiche_instance_id = $2`,
        [organizationId, conversationFicheInstanceId],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async setArchivee(organizationId, id, archivee): Promise<Fiche | null> {
      const { rows } = await pool.query<FicheRow>(
        `UPDATE fiches SET archivee = $1
          WHERE organization_id = $2 AND id = $3
          RETURNING ${COLUMNS}`,
        [archivee, organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async setQualificationStatus(organizationId, id, key, updatedBy): Promise<Fiche | null> {
      const { rows } = await pool.query<FicheRow>(
        `UPDATE fiches SET
           qualification_status_key = $1,
           qualification_status_updated_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END,
           qualification_status_updated_by = CASE WHEN $1::text IS NULL THEN NULL ELSE $2::uuid END
         WHERE organization_id = $3 AND id = $4
         RETURNING ${COLUMNS}`,
        [key, updatedBy, organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },
  };
}
