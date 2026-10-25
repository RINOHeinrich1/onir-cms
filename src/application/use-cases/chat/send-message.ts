import { AppError, BadGatewayError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { buildAttachmentPromptContext } from "@/application/use-cases/attachments/attachment-prompt";
import {
  buildContexteInterne,
  selectConnaissancesUtiles,
} from "@/application/use-cases/connaissances/select-connaissances";
import { type Attachment, DEFAULT_FILE_CONSTRAINTS } from "@/domain/entities/attachment";
import type { ChatLink, ChatMessage } from "@/domain/entities/chat";
import { type ConnaissanceRef, toConnaissanceRef } from "@/domain/entities/connaissance";
import { buildServerVariables } from "@/domain/template-variables";
import { buildSystemPromptFromTemplate } from "@/infrastructure/ai/system-prompt";

export type SendMessageDependencies = {
  organizations: OrganizationRepository;
  links: ChatLinkRepository;
  conversations: ConversationRepository;
  prospects: ProspectRepository;
  templates: ChatTemplateRepository;
  connaissances: ConnaissanceRepository;
  medias: MediaRepository;
  attachments: AttachmentRepository;
  ai: AiClientFactory;
};

export type SendMessageResult = {
  organizationId: string;
  /** Message utilisateur effectivement enregistré (avec ses pièces). */
  userMessage: ChatMessage;
  /** Réponse IA ; null pour un message composé uniquement de fichiers. */
  message: ChatMessage | null;
  connaissances: ConnaissanceRef[];
  mediaPending: boolean;
};

const MAX_CONTENT_LENGTH = 4000;
const MAX_ATTACHMENT_IDS = 25;

function parseAttachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > MAX_ATTACHMENT_IDS) {
    throw new ValidationError(`Trop de pièces jointes (${MAX_ATTACHMENT_IDS} maximum)`);
  }
  return ids;
}

/** Sources média actives et non vides pour ce lien (organisation du lien). */
async function hasEligibleMedia(
  deps: SendMessageDependencies,
  organizationId: string,
  link: ChatLink,
): Promise<boolean> {
  const wantsPhotos = link.sources.phototheque;
  const wantsLiens = link.sources.lien;
  if (!wantsPhotos && !wantsLiens) return false;
  const [photos, liens] = await Promise.all([
    wantsPhotos
      ? deps.medias.listActivesByType(organizationId, "photo", link.templateKey)
      : Promise.resolve([]),
    wantsLiens
      ? deps.medias.listActivesByType(organizationId, "lien", link.templateKey)
      : Promise.resolve([]),
  ]);
  return photos.length > 0 || liens.length > 0;
}

/**
 * Vérifie que les pièces appartiennent aux champs fichier du modèle et aux
 * limites du champ. Aucun contenu n'est analysé (ADR-0034).
 */
async function validateAttachments(
  deps: SendMessageDependencies,
  organizationId: string,
  conversationId: string,
  templateFields: { name: string; type: string; file?: { maxFiles: number } }[],
  ids: string[],
): Promise<Attachment[]> {
  if (ids.length === 0) return [];
  const found = await deps.attachments.listByIds(organizationId, conversationId, ids);
  if (found.length !== ids.length) {
    throw new ValidationError("Pièce jointe introuvable ou déjà envoyée");
  }
  const byId = new Map(found.map((attachment) => [attachment.id, attachment]));
  const counts = new Map<string, number>();
  for (const id of ids) {
    const attachment = byId.get(id);
    if (attachment === undefined || attachment.messageId !== null) {
      throw new ValidationError("Pièce jointe introuvable ou déjà envoyée");
    }
    const field = templateFields.find(
      (candidate) => candidate.name === attachment.fieldName && candidate.type === "file",
    );
    if (field === undefined) {
      throw new ValidationError("Ce champ n'accepte pas de fichier");
    }
    counts.set(attachment.fieldName, (counts.get(attachment.fieldName) ?? 0) + 1);
  }
  for (const fieldName of counts.keys()) {
    const field = templateFields.find((candidate) => candidate.name === fieldName);
    const maxFiles = field?.file?.maxFiles ?? DEFAULT_FILE_CONSTRAINTS.maxFiles;
    const existing = await deps.attachments.countForField(
      organizationId,
      conversationId,
      fieldName,
    );
    if (existing > maxFiles) {
      throw new ValidationError(`« ${fieldName} » : ${maxFiles} fichier(s) maximum`);
    }
  }
  return ids.map((id) => byId.get(id)).filter((entry): entry is Attachment => entry !== undefined);
}

/**
 * US-CHAT-001 — envoi d'un message visiteur. L'organisation est dérivée de la
 * conversation (capability) puis toutes les lectures sont scopées.
 *
 * ADR-0034 : les pièces jointes ne sont jamais transmises à l'IA. Un message
 * uniquement composé de fichiers est enregistré sans réponse IA.
 */
export async function sendMessage(
  deps: SendMessageDependencies,
  input: { conversationId: string; content: unknown; attachmentIds?: unknown },
): Promise<SendMessageResult> {
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const attachmentIds = parseAttachmentIds(input.attachmentIds);
  if (content === "" && attachmentIds.length === 0) {
    throw new ValidationError("Message vide");
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new ValidationError(`Message trop long (${MAX_CONTENT_LENGTH} caractères maximum)`);
  }

  const conversation = await deps.conversations.findByIdPublic(input.conversationId);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const organizationId = conversation.organizationId;
  const organization = await deps.organizations.findById(organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new NotFoundError("Conversation introuvable");
  }

  const link = await deps.links.findById(organizationId, conversation.linkId);
  if (link === null || !link.actif) {
    throw new NotFoundError("Lien invalide ou révoqué");
  }
  const template = await deps.templates.findVersion(
    organizationId,
    link.templateKey,
    link.templateVersion,
  );
  if (template === null) {
    throw new NotFoundError("Modèle de raisonnement introuvable");
  }

  await validateAttachments(
    deps,
    organizationId,
    conversation.id,
    template.definition.fields,
    attachmentIds,
  );

  const userMessage = await deps.conversations.appendMessage(
    organizationId,
    conversation.id,
    "user",
    content,
    attachmentIds,
  );
  if (content === "") {
    return {
      organizationId,
      userMessage,
      message: null,
      connaissances: [],
      mediaPending: false,
    };
  }

  // Historique borné : les tours anciens n'apportent rien au cadrage.
  const HISTORY_LIMIT = 20;
  const history = (await deps.conversations.listMessages(organizationId, conversation.id)).slice(
    -HISTORY_LIMIT,
  );
  const ai = await deps.ai.forTarget({
    organizationId,
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  });

  let prospect = null;
  if (link.type === "specifique" && link.prospectId !== null) {
    prospect = await deps.prospects.findById(organizationId, link.prospectId);
  }

  const system = buildSystemPromptFromTemplate({
    definition: template.definition,
    serverVars: buildServerVariables({ mode: link.type, prospect, conversation }),
  });

  // Métadonnées des pièces (jamais leur contenu) pour que l'IA demande les
  // champs fichier manquants, y compris les champs requis (ADR-0034).
  const conversationAttachments = await deps.attachments.listByConversation(
    organizationId,
    conversation.id,
  );
  const attachmentContext = buildAttachmentPromptContext(
    template.definition.fields,
    conversationAttachments,
  );
  let systemEnrichi =
    attachmentContext === ""
      ? system
      : `${system}

${attachmentContext}`;
  let connaissances: ConnaissanceRef[] = [];
  if (link.sources.connaissances) {
    const actives = await deps.connaissances.listActives(organizationId, link.templateKey);
    const utiles = await selectConnaissancesUtiles({ ai }, actives, content);
    if (utiles.length > 0) {
      systemEnrichi = `${systemEnrichi}\n\n${buildContexteInterne(utiles)}`;
      connaissances = utiles.map(toConnaissanceRef);
    }
  }

  let answer: string;
  try {
    answer = await ai.complete({
      system: systemEnrichi,
      messages: history.map((message) => ({ role: message.role, content: message.content })),
      maxTokens: 400,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new BadGatewayError("Service IA momentanément indisponible, réessayez");
  }

  const message = await deps.conversations.appendMessage(
    organizationId,
    conversation.id,
    "assistant",
    answer,
  );
  const mediaPending = await hasEligibleMedia(deps, organizationId, link);
  return { organizationId, userMessage, message, mediaPending, connaissances };
}
