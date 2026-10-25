import { createHash } from "node:crypto";
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from "@/application/errors";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { AttachmentStorage } from "@/application/ports/attachment-storage";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import { detectAttachmentMime } from "@/domain/attachment-inspection";
import {
  ATTACHMENT_MAX_BYTES,
  type Attachment,
  type AttachmentView,
  DEFAULT_FILE_CONSTRAINTS,
  fileFieldAccepts,
  sanitizeOriginalName,
  toAttachmentView,
} from "@/domain/entities/attachment";
import type { TemplateField } from "@/domain/entities/chat-template";
import { signedAttachmentUrl } from "@/lib/attachment-token";

export type AttachmentDependencies = {
  organizations: OrganizationRepository;
  links: ChatLinkRepository;
  conversations: ConversationRepository;
  templates: ChatTemplateRepository;
  attachments: AttachmentRepository;
  storage: AttachmentStorage;
};

export type AttachmentDto = AttachmentView & { url: string };

export function toAttachmentDto(attachment: Attachment): AttachmentDto {
  return {
    ...toAttachmentView(attachment),
    url: signedAttachmentUrl(attachment.id, attachment.organizationId),
  };
}

function fileField(template: { definition: { fields: TemplateField[] } }, fieldName: string) {
  return template.definition.fields.find(
    (field) => field.name === fieldName && field.type === "file",
  );
}

/** Comptes de pièces par champ pour une conversation (ADR-0034). */
export async function countAttachmentsByField(
  attachments: AttachmentRepository,
  organizationId: string,
  conversationId: string,
): Promise<Record<string, number>> {
  const all = await attachments.listByConversation(organizationId, conversationId);
  const counts: Record<string, number> = {};
  for (const attachment of all) {
    counts[attachment.fieldName] = (counts[attachment.fieldName] ?? 0) + 1;
  }
  return counts;
}

export async function listConversationAttachments(
  deps: Pick<AttachmentDependencies, "attachments">,
  organizationId: string,
  conversationId: string,
): Promise<Attachment[]> {
  return deps.attachments.listByConversation(organizationId, conversationId);
}

/**
 * Enregistre une pièce jointe publique. Aucune analyse de contenu : seuls le
 * format réel, la taille et l'appartenance au champ sont contrôlés.
 */
export async function storeConversationAttachment(
  deps: AttachmentDependencies,
  input: {
    conversationId: string;
    fieldName: string;
    fileName: string;
    data: Buffer;
  },
): Promise<Attachment> {
  const conversation = await deps.conversations.findByIdPublic(input.conversationId);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const organization = await deps.organizations.findById(conversation.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new NotFoundError("Conversation introuvable");
  }
  if (conversation.statut === "finalisee") {
    throw new UnprocessableError("La discussion est terminée : aucune pièce ne peut être ajoutée");
  }
  const link = await deps.links.findById(conversation.organizationId, conversation.linkId);
  if (link === null || !link.actif) {
    throw new NotFoundError("Lien invalide ou révoqué");
  }
  const template = await deps.templates.findVersion(
    conversation.organizationId,
    link.templateKey,
    link.templateVersion,
  );
  if (template === null) {
    throw new NotFoundError("Modèle de raisonnement introuvable");
  }
  const field = fileField(template, input.fieldName);
  if (field === undefined) {
    throw new ValidationError("Ce champ n'accepte pas de fichier");
  }
  const constraints = field.file ?? DEFAULT_FILE_CONSTRAINTS;
  if (input.data.byteLength === 0) {
    throw new ValidationError("Fichier vide");
  }
  if (input.data.byteLength > constraints.maxBytes) {
    throw new ValidationError(
      `Fichier trop volumineux (${Math.round(constraints.maxBytes / 1024 / 1024)} Mo maximum)`,
    );
  }

  const used = await deps.attachments.countForField(
    conversation.organizationId,
    conversation.id,
    field.name,
  );
  if (used >= constraints.maxFiles) {
    throw new ConflictError(`« ${field.label} » : ${constraints.maxFiles} fichier(s) maximum`);
  }

  const mime = detectAttachmentMime(input.data);
  if (mime === null || !fileFieldAccepts(constraints, mime)) {
    throw new ValidationError(
      `Format non autorisé pour « ${field.label} » (${constraints.accept.join(", ")})`,
    );
  }
  if (input.data.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new ValidationError("Fichier trop volumineux");
  }

  const originalName = sanitizeOriginalName(input.fileName);
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const storageKey = await deps.storage.save({
    data: input.data,
    mime,
    organizationId: conversation.organizationId,
  });
  try {
    return await deps.attachments.create(conversation.organizationId, {
      conversationId: conversation.id,
      messageId: null,
      fieldName: field.name,
      fieldLabel: field.label,
      originalName,
      mime,
      sizeBytes: input.data.byteLength,
      storageKey,
      sha256,
    });
  } catch (error) {
    await deps.storage.remove(storageKey);
    throw error;
  }
}

/** Supprime une pièce encore en attente (jamais rattachée à un message/fiche). */
export async function deletePendingAttachment(
  deps: Pick<AttachmentDependencies, "organizations" | "attachments" | "storage">,
  input: { conversationId: string; attachmentId: string },
): Promise<void> {
  const attachment = await deps.attachments.findByIdPublic(input.attachmentId);
  if (attachment === null || attachment.conversationId !== input.conversationId) {
    throw new NotFoundError("Pièce jointe introuvable");
  }
  const organization = await deps.organizations.findById(attachment.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new NotFoundError("Pièce jointe introuvable");
  }
  const deleted = await deps.attachments.deletePending(attachment.organizationId, attachment.id);
  if (!deleted) {
    throw new ConflictError("Cette pièce est déjà rattachée à un message ou une fiche");
  }
  await deps.storage.remove(attachment.storageKey);
}
