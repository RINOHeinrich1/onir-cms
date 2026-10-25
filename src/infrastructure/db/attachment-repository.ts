import type { Pool } from "pg";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import {
  type Attachment,
  type CreateAttachmentInput,
  type FicheAttachment,
  isAttachmentMime,
  type OrganizationAttachment,
} from "@/domain/entities/attachment";

type AttachmentRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  message_id: string | null;
  field_name: string;
  field_label: string;
  original_name: string;
  mime: string;
  size_bytes: string | number;
  storage_key: string;
  sha256: string;
  created_at: Date;
};

const COLUMNS =
  "id, organization_id, conversation_id, message_id, field_name, field_label, original_name, mime, size_bytes, storage_key, sha256, created_at";

function toEntity(row: AttachmentRow): Attachment {
  if (!isAttachmentMime(row.mime)) {
    throw new Error(`Type MIME de pièce jointe inconnu : ${row.mime}`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    fieldName: row.field_name,
    fieldLabel: row.field_label,
    originalName: row.original_name,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
    sha256: row.sha256,
    createdAt: row.created_at.toISOString(),
  };
}

/** Adapter PostgreSQL des pièces jointes (ADR-0034), scopé organisation. */
export function pgAttachmentRepository(pool: Pool): AttachmentRepository {
  return {
    async create(organizationId, input: CreateAttachmentInput): Promise<Attachment> {
      const { rows } = await pool.query<AttachmentRow>(
        `INSERT INTO conversation_attachments
           (organization_id, conversation_id, message_id, field_name, field_label,
            original_name, mime, size_bytes, storage_key, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.conversationId,
          input.messageId,
          input.fieldName,
          input.fieldLabel,
          input.originalName,
          input.mime,
          input.sizeBytes,
          input.storageKey,
          input.sha256,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la pièce jointe");
      return toEntity(row);
    },

    async findById(organizationId, id): Promise<Attachment | null> {
      const { rows } = await pool.query<AttachmentRow>(
        `SELECT ${COLUMNS} FROM conversation_attachments
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async findByIdPublic(id): Promise<Attachment | null> {
      const { rows } = await pool.query<AttachmentRow>(
        `SELECT ${COLUMNS} FROM conversation_attachments WHERE id = $1`,
        [id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async listByConversation(organizationId, conversationId): Promise<Attachment[]> {
      const { rows } = await pool.query<AttachmentRow>(
        `SELECT ${COLUMNS} FROM conversation_attachments
          WHERE organization_id = $1 AND conversation_id = $2
          ORDER BY created_at ASC`,
        [organizationId, conversationId],
      );
      return rows.map(toEntity);
    },

    async listByIds(organizationId, conversationId, ids): Promise<Attachment[]> {
      if (ids.length === 0) return [];
      const { rows } = await pool.query<AttachmentRow>(
        `SELECT ${COLUMNS} FROM conversation_attachments
          WHERE organization_id = $1 AND conversation_id = $2 AND id = ANY($3::uuid[])`,
        [organizationId, conversationId, ids],
      );
      return rows.map(toEntity);
    },

    async countForField(organizationId, conversationId, fieldName): Promise<number> {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM conversation_attachments
          WHERE organization_id = $1 AND conversation_id = $2 AND field_name = $3`,
        [organizationId, conversationId, fieldName],
      );
      return Number(rows[0]?.count ?? 0);
    },

    async deletePending(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        `DELETE FROM conversation_attachments a
          WHERE a.organization_id = $1 AND a.id = $2 AND a.message_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM fiche_attachments f WHERE f.attachment_id = a.id)`,
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listByFiche(organizationId, ficheId): Promise<FicheAttachment[]> {
      const { rows } = await pool.query<AttachmentRow & { fiche_id: string }>(
        `SELECT ${COLUMNS.split(", ")
          .map((column) => `a.${column}`)
          .join(", ")}, f.fiche_id
           FROM fiche_attachments f
           JOIN conversation_attachments a ON a.id = f.attachment_id
           JOIN fiches fi ON fi.id = f.fiche_id AND fi.organization_id = a.organization_id
          WHERE f.fiche_id = $1 AND a.organization_id = $2
          ORDER BY f.created_at ASC`,
        [ficheId, organizationId],
      );
      return rows.map((row) => ({ ...toEntity(row), ficheId: row.fiche_id }));
    },

    async listForOrganization(organizationId, limit = 500): Promise<OrganizationAttachment[]> {
      const { rows } = await pool.query<
        AttachmentRow & {
          prospect_id: string | null;
          prospect_nom: string | null;
          prospect_prenom: string | null;
          visitor_nom: string;
          visitor_email: string;
          link_label: string | null;
          fiche_id: string | null;
        }
      >(
        `SELECT ${COLUMNS.split(", ")
          .map((column) => `a.${column}`)
          .join(", ")},
                c.prospect_id, p.nom AS prospect_nom, p.prenom AS prospect_prenom,
                c.visitor_nom, c.visitor_email, l.label AS link_label, fa.fiche_id
           FROM conversation_attachments a
           JOIN conversations c
             ON c.id = a.conversation_id AND c.organization_id = a.organization_id
           LEFT JOIN prospects p
             ON p.id = c.prospect_id AND p.organization_id = a.organization_id
           LEFT JOIN chat_links l
             ON l.id = c.link_id AND l.organization_id = a.organization_id
           LEFT JOIN LATERAL (
             SELECT f.fiche_id
               FROM fiche_attachments f
              WHERE f.attachment_id = a.id
              ORDER BY f.created_at DESC
              LIMIT 1
           ) fa ON true
          WHERE a.organization_id = $1
          ORDER BY a.created_at DESC
          LIMIT $2`,
        [organizationId, Math.max(1, Math.min(limit, 2000))],
      );
      return rows.map((row) => ({
        ...toEntity(row),
        prospectId: row.prospect_id,
        prospectNom: row.prospect_nom ?? "",
        prospectPrenom: row.prospect_prenom ?? "",
        visitorNom: row.visitor_nom,
        visitorEmail: row.visitor_email,
        linkLabel: row.link_label ?? "",
        ficheId: row.fiche_id,
      }));
    },

    async attachToFiche(organizationId, ficheId, attachments): Promise<void> {
      for (const attachment of attachments) {
        await pool.query(
          `INSERT INTO fiche_attachments (fiche_id, attachment_id, field_name)
           SELECT $1, a.id, a.field_name
             FROM conversation_attachments a
             JOIN fiches f ON f.id = $1 AND f.organization_id = $2
            WHERE a.id = $3 AND a.organization_id = $2
           ON CONFLICT (fiche_id, attachment_id) DO NOTHING`,
          [ficheId, organizationId, attachment.id],
        );
      }
    },
  };
}
