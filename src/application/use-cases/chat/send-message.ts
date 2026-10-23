import { AppError, BadGatewayError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import {
  buildContexteInterne,
  selectConnaissancesUtiles,
} from "@/application/use-cases/connaissances/select-connaissances";
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
  ai: AiClientFactory;
};

export type SendMessageResult = {
  message: ChatMessage;
  connaissances: ConnaissanceRef[];
  mediaPending: boolean;
};

const MAX_CONTENT_LENGTH = 4000;

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
 * US-CHAT-001 — envoi d'un message visiteur. L'organisation est dérivée de la
 * conversation (capability) puis toutes les lectures sont scopées.
 */
export async function sendMessage(
  deps: SendMessageDependencies,
  input: { conversationId: string; content: unknown },
): Promise<SendMessageResult> {
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (content === "") {
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
  await deps.conversations.appendMessage(organizationId, conversation.id, "user", content);
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

  const template = await deps.templates.findVersion(
    organizationId,
    link.templateKey,
    link.templateVersion,
  );
  if (template === null) {
    throw new NotFoundError("Modèle de raisonnement introuvable");
  }

  const system = buildSystemPromptFromTemplate({
    definition: template.definition,
    serverVars: buildServerVariables({ mode: link.type, prospect, conversation }),
  });

  // Mini-RAG connaissances (US-CHAT-004), uniquement si la source est cochée.
  let systemEnrichi = system;
  let connaissances: ConnaissanceRef[] = [];
  if (link.sources.connaissances) {
    const actives = await deps.connaissances.listActives(organizationId, link.templateKey);
    const utiles = await selectConnaissancesUtiles({ ai }, actives, content);
    if (utiles.length > 0) {
      systemEnrichi = `${system}\n\n${buildContexteInterne(utiles)}`;
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
  return { message, mediaPending, connaissances };
}
