import type { Pool } from "pg";
import type {
  ConversationRepository,
  ConversationStatusCounts,
  ConversationSummary,
  CreateConversationInput,
} from "@/application/ports/conversation-repository";
import {
  type AttachmentView,
  isAttachmentMime,
  toAttachmentView,
} from "@/domain/entities/attachment";
import {
  type ChatMessage,
  type ChatMessageMedia,
  type ChatMessageRole,
  type Conversation,
  isStatutConversation,
  type VisitorContact,
} from "@/domain/entities/chat";
import { isTypeMedia } from "@/domain/entities/media";

type ConversationRow = {
  id: string;
  organization_id: string;
  link_id: string;
  visitor_nom: string;
  visitor_email: string;
  visitor_contacts: unknown;
  prospect_id: string | null;
  statut: string;
  last_message_at: Date | null;
  consentement_at: Date | null;
  confidentialite_id: string | null;
  channel: string;
  created_at: Date;
};

const CONVERSATION_COLUMNS =
  "id, organization_id, link_id, visitor_nom, visitor_email, visitor_contacts, prospect_id, statut, last_message_at, consentement_at, confidentialite_id, channel, created_at";

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  medias: unknown;
  attachments?: unknown;
  created_at: Date;
};

const MESSAGE_COLUMNS = "id, conversation_id, role, content, medias, created_at";
const MESSAGE_COLUMNS_M = "m.id, m.conversation_id, m.role, m.content, m.medias, m.created_at";
const MESSAGE_COLUMNS_WITH_ATTACHMENTS = `${MESSAGE_COLUMNS_M}, COALESCE(att.items, '[]'::json) AS attachments`;

function parseContacts(value: unknown): VisitorContact[] {
  if (!Array.isArray(value)) return [];
  const contacts: VisitorContact[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.type === "string" && typeof record.valeur === "string") {
      contacts.push({ type: record.type, valeur: record.valeur });
    }
  }
  return contacts;
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    linkId: row.link_id,
    visitorNom: row.visitor_nom,
    visitorEmail: row.visitor_email,
    visitorContacts: parseContacts(row.visitor_contacts),
    prospectId: row.prospect_id,
    statut: isStatutConversation(row.statut) ? row.statut : "en_cours",
    lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
    consentementAt: row.consentement_at ? row.consentement_at.toISOString() : null,
    confidentialiteId: row.confidentialite_id,
    channel: row.channel === "widget" ? "widget" : "page",
    createdAt: row.created_at.toISOString(),
  };
}

/** Médias d'un message : `[]` si non calculés (NULL) ou JSON invalide. */
function parseMedias(value: unknown): ChatMessageMedia[] {
  if (!Array.isArray(value)) return [];
  const medias: ChatMessageMedia[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = record.id;
    const type = record.type;
    const libelle = record.libelle;
    const url = record.url;
    if (
      typeof id === "string" &&
      typeof type === "string" &&
      isTypeMedia(type) &&
      typeof libelle === "string" &&
      typeof url === "string"
    ) {
      medias.push({
        id,
        type,
        libelle,
        url,
        mime: typeof record.mime === "string" ? record.mime : null,
      });
    }
  }
  return medias;
}

function parseAttachments(value: unknown): AttachmentView[] {
  if (!Array.isArray(value)) return [];
  const attachments: AttachmentView[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.conversationId !== "string" ||
      typeof record.fieldName !== "string" ||
      typeof record.fieldLabel !== "string" ||
      typeof record.originalName !== "string" ||
      typeof record.mime !== "string" ||
      !isAttachmentMime(record.mime) ||
      typeof record.sizeBytes !== "number" ||
      typeof record.createdAt !== "string"
    ) {
      continue;
    }
    attachments.push(
      toAttachmentView({
        id: record.id,
        organizationId: "",
        conversationId: record.conversationId,
        messageId: typeof record.messageId === "string" ? record.messageId : null,
        fieldName: record.fieldName,
        fieldLabel: record.fieldLabel,
        originalName: record.originalName,
        mime: record.mime,
        sizeBytes: record.sizeBytes,
        storageKey: "",
        sha256: "",
        createdAt: record.createdAt,
      }),
    );
  }
  return attachments;
}

function toMessage(row: MessageRow): ChatMessage {
  const role: ChatMessageRole = row.role === "assistant" ? "assistant" : "user";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role,
    content: row.content,
    medias: parseMedias(row.medias),
    mediasComputed: row.medias !== null && row.medias !== undefined,
    attachments: parseAttachments(row.attachments),
    createdAt: row.created_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `ConversationRepository` (B020, scopé ADR-0025). */
export function pgConversationRepository(pool: Pool): ConversationRepository {
  return {
    async findById(organizationId, id): Promise<Conversation | null> {
      const { rows } = await pool.query<ConversationRow>(
        `SELECT ${CONVERSATION_COLUMNS} FROM conversations
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toConversation(row) : null;
    },

    async findByIdPublic(id): Promise<Conversation | null> {
      const { rows } = await pool.query<ConversationRow>(
        `SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      return row ? toConversation(row) : null;
    },

    async findOpenByLinkAndProspect(
      organizationId,
      linkId,
      prospectId,
      channel = "page",
    ): Promise<Conversation | null> {
      const { rows } = await pool.query<ConversationRow>(
        `SELECT ${CONVERSATION_COLUMNS} FROM conversations
         WHERE organization_id = $1 AND link_id = $2 AND prospect_id = $3
           AND channel = $4 AND statut = 'en_cours'
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId, linkId, prospectId, channel],
      );
      const row = rows[0];
      return row ? toConversation(row) : null;
    },

    async listWithDetails(
      organizationId,
      filter,
      linkLabel: string | null = null,
    ): Promise<ConversationSummary[]> {
      const clause =
        filter === "en_cours"
          ? "WHERE cv.organization_id = $1 AND cv.statut = 'en_cours' AND cv.archivee = false"
          : filter === "finalisees"
            ? "WHERE cv.organization_id = $1 AND cv.statut = 'finalisee' AND cv.archivee = false"
            : filter === "archivees"
              ? "WHERE cv.organization_id = $1 AND cv.archivee = true"
              : "WHERE cv.organization_id = $1 AND cv.archivee = false";
      const linkClause = linkLabel === null ? "" : "AND l.label = $2";
      const params = linkLabel === null ? [organizationId] : [organizationId, linkLabel];
      const { rows } = await pool.query<{
        id: string;
        visitor_nom: string;
        visitor_email: string;
        link_id: string;
        link_label: string;
        link_type: string;
        prospect_id: string | null;
        statut: string;
        message_count: number;
        last_message_at: Date | null;
        archivee: boolean;
        created_at: Date;
      }>(
        `SELECT cv.id, cv.visitor_nom, cv.visitor_email, cv.link_id, cv.prospect_id, cv.statut,
                cv.last_message_at, cv.archivee, cv.created_at,
                l.label AS link_label, l.type AS link_type,
                (SELECT count(*)::int FROM chat_messages m WHERE m.conversation_id = cv.id) AS message_count
         FROM conversations cv
         JOIN chat_links l ON l.id = cv.link_id AND l.organization_id = cv.organization_id
         ${clause} ${linkClause}
         ORDER BY coalesce(cv.last_message_at, cv.created_at) DESC`,
        params,
      );
      return rows.map((row) => ({
        id: row.id,
        visitorNom: row.visitor_nom,
        visitorEmail: row.visitor_email,
        linkId: row.link_id,
        linkLabel: row.link_label,
        linkType: row.link_type,
        prospectId: row.prospect_id,
        statut: isStatutConversation(row.statut) ? row.statut : "en_cours",
        messageCount: row.message_count,
        lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
        archivee: row.archivee,
        createdAt: row.created_at.toISOString(),
      }));
    },

    async countByStatut(organizationId): Promise<ConversationStatusCounts> {
      const { rows } = await pool.query<{ en_cours: number; finalisees: number }>(
        `SELECT
           count(*) FILTER (WHERE statut = 'en_cours')::int AS en_cours,
           count(*) FILTER (WHERE statut = 'finalisee')::int AS finalisees
         FROM conversations
         WHERE organization_id = $1 AND archivee = false`,
        [organizationId],
      );
      const row = rows[0];
      return { enCours: row?.en_cours ?? 0, finalisees: row?.finalisees ?? 0 };
    },

    async create(organizationId, input: CreateConversationInput): Promise<Conversation> {
      const { rows } = await pool.query<ConversationRow>(
        `INSERT INTO conversations (organization_id, link_id, visitor_nom, visitor_email, visitor_contacts, prospect_id, consentement_at, confidentialite_id, channel)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${CONVERSATION_COLUMNS}`,
        [
          organizationId,
          input.linkId,
          input.visitorNom,
          input.visitorEmail,
          JSON.stringify(input.visitorContacts),
          input.prospectId,
          input.consentementAt,
          input.confidentialiteId,
          input.channel ?? "page",
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la conversation");
      return toConversation(row);
    },

    async markFinalisee(organizationId, id): Promise<void> {
      await pool.query(
        `UPDATE conversations SET statut = 'finalisee', updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
    },

    async setArchivee(organizationId, id, archivee): Promise<boolean> {
      const result = await pool.query(
        `UPDATE conversations SET archivee = $1, updated_at = now()
          WHERE organization_id = $2 AND id = $3`,
        [archivee, organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async appendMessage(
      organizationId,
      conversationId,
      role,
      content,
      attachmentIds = [],
    ): Promise<ChatMessage> {
      // Message + rattachement des pièces dans une même transaction : un échec
      // de rattachement ne laisse pas de message partiel.
      const client = await pool.connect();
      let row: MessageRow | undefined;
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<MessageRow>(
          `WITH target AS (
             SELECT id FROM conversations WHERE organization_id = $1 AND id = $2
           ), inserted AS (
             INSERT INTO chat_messages (conversation_id, role, content)
             SELECT id, $3, $4 FROM target
             RETURNING ${MESSAGE_COLUMNS}
           )
           SELECT * FROM inserted`,
          [organizationId, conversationId, role, content],
        );
        row = rows[0];
        if (!row) throw new Error("Échec d'enregistrement du message");

        if (attachmentIds.length > 0) {
          const linked = await client.query(
            `UPDATE conversation_attachments
                SET message_id = $1
              WHERE organization_id = $2 AND conversation_id = $3
                AND id = ANY($4::uuid[]) AND message_id IS NULL
              RETURNING id`,
            [row.id, organizationId, conversationId, attachmentIds],
          );
          if ((linked.rowCount ?? 0) !== attachmentIds.length) {
            throw new Error("Pièce jointe introuvable ou déjà rattachée");
          }
        }

        await client.query(
          "UPDATE conversations SET last_message_at = now(), updated_at = now() WHERE organization_id = $1 AND id = $2",
          [organizationId, conversationId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      if (row === undefined) throw new Error("Échec d'enregistrement du message");
      const saved = await this.findMessage(organizationId, row.id);
      if (saved === null) throw new Error("Échec d'enregistrement du message");
      return saved;
    },

    async findMessage(organizationId, id): Promise<ChatMessage | null> {
      const { rows } = await pool.query<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS_WITH_ATTACHMENTS}
           FROM chat_messages m
           JOIN conversations c ON c.id = m.conversation_id AND c.organization_id = $1
           LEFT JOIN LATERAL (
             SELECT json_agg(json_build_object(
               'id', a.id, 'conversationId', a.conversation_id, 'messageId', a.message_id,
               'fieldName', a.field_name, 'fieldLabel', a.field_label,
               'originalName', a.original_name, 'mime', a.mime,
               'sizeBytes', a.size_bytes, 'createdAt', a.created_at
             ) ORDER BY a.created_at) AS items
             FROM conversation_attachments a WHERE a.message_id = m.id
           ) att ON true
          WHERE m.id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toMessage(row) : null;
    },

    async listMessages(organizationId, conversationId): Promise<ChatMessage[]> {
      const { rows } = await pool.query<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS_WITH_ATTACHMENTS}
         FROM chat_messages m
         JOIN conversations c ON c.id = m.conversation_id AND c.organization_id = $1
         LEFT JOIN LATERAL (
           SELECT json_agg(json_build_object(
             'id', a.id, 'conversationId', a.conversation_id, 'messageId', a.message_id,
             'fieldName', a.field_name, 'fieldLabel', a.field_label,
             'originalName', a.original_name, 'mime', a.mime,
             'sizeBytes', a.size_bytes, 'createdAt', a.created_at
           ) ORDER BY a.created_at) AS items
           FROM conversation_attachments a WHERE a.message_id = m.id
         ) att ON true
         WHERE m.conversation_id = $2
         ORDER BY m.created_at ASC`,
        [organizationId, conversationId],
      );
      return rows.map((row) => toMessage(row));
    },

    async setMessageMedias(organizationId, messageId, medias): Promise<ChatMessage | null> {
      const { rows } = await pool.query<MessageRow>(
        `UPDATE chat_messages m SET medias = $1
          FROM conversations c
          WHERE m.id = $2 AND m.conversation_id = c.id AND c.organization_id = $3
          RETURNING ${MESSAGE_COLUMNS_M}`,
        [JSON.stringify(medias), messageId, organizationId],
      );
      const row = rows[0];
      return row ? toMessage(row) : null;
    },

    async listByLink(organizationId, linkId): Promise<Conversation[]> {
      const { rows } = await pool.query<ConversationRow>(
        `SELECT ${CONVERSATION_COLUMNS}
         FROM conversations
         WHERE organization_id = $1 AND link_id = $2
         ORDER BY created_at DESC`,
        [organizationId, linkId],
      );
      return rows.map((row) => toConversation(row));
    },
  };
}
