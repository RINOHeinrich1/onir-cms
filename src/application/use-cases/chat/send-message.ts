import { AppError, BadGatewayError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiTokenUsage } from "@/application/ports/ai-client";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import { fallbackAiClient } from "@/application/use-cases/ai/with-fallback";
import { buildAttachmentPromptContext } from "@/application/use-cases/attachments/attachment-prompt";
import { assertChatLinkAvailable } from "@/application/use-cases/chat/chat-link-quota";
import {
  conversationOnlyDefinition,
  ficheToDefinition,
  findFiche,
  resolveCurrentConfig,
} from "@/application/use-cases/chat/chatbot-config-runtime";
import {
  listRuntimeConnaissances,
  listRuntimeMedias,
} from "@/application/use-cases/chat/chatbot-data-runtime";
import {
  applyFicheDetection,
  detectFicheInstances,
  ensureMonoFicheInstance,
  fallbackToPrimaryFiche,
  instanceForFiche,
} from "@/application/use-cases/chat/fiche-instances";
import {
  buildContexteInterne,
  selectConnaissancesUtiles,
} from "@/application/use-cases/connaissances/select-connaissances";
import { type Attachment, DEFAULT_FILE_CONSTRAINTS } from "@/domain/entities/attachment";
import type {
  ChatLink,
  ChatMessage,
  ChatMessageRole,
  ConversationInterventionMode,
} from "@/domain/entities/chat";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import { type ConnaissanceRef, toConnaissanceRef } from "@/domain/entities/connaissance";
import type { ConversationFicheInstance } from "@/domain/entities/conversation-fiche-instance";
import { languageReminder } from "@/domain/template-settings";
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
  /** Configuration chatbot autonome (ADR-0049) ; absent = legacy uniquement. */
  configs?: ChatbotConfigRepository;
  ficheInstances?: ConversationFicheInstanceRepository;
};

export type SendMessageResult = {
  organizationId: string;
  /** Message utilisateur effectivement enregistré (avec ses pièces). */
  userMessage: ChatMessage;
  /** Réponse IA ; null pour un message composé uniquement de fichiers. */
  message: ChatMessage | null;
  connaissances: ConnaissanceRef[];
  mediaPending: boolean;
  /** Mode après envoi : l'IA répond (`ai`) ou un opérateur a la main (`human`). */
  mode: ConversationInterventionMode;
};

/** Rôle transmis à l'IA : un message opérateur est un tour « assistant ». */
function toAiRole(role: ChatMessageRole): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

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

/** Sources média actives et non vides pour ce lien (sélection runtime incluse). */
async function hasEligibleMedia(
  deps: SendMessageDependencies,
  organizationId: string,
  link: ChatLink,
  config: ChatbotConfig | null,
): Promise<boolean> {
  const wantsPhotos = link.sources.phototheque;
  const wantsLiens = link.sources.lien;
  if (!wantsPhotos && !wantsLiens) return false;
  const [photos, liens] = await Promise.all([
    wantsPhotos
      ? listRuntimeMedias(deps, organizationId, link, "photo", config)
      : Promise.resolve([]),
    wantsLiens
      ? listRuntimeMedias(deps, organizationId, link, "lien", config)
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
  assertChatLinkAvailable(link);
  const config = await resolveCurrentConfig(deps.configs, organizationId, link);
  const instancesRepo = deps.ficheInstances;
  let activeInstance: ConversationFicheInstance | null = null;
  let templateDefinition: TemplateDefinition | null = null;
  let attachmentFields: TemplateField[] = [];
  if (config !== null) {
    if (deps.conversations.setConfig !== undefined) {
      await deps.conversations.setConfig(organizationId, conversation.id, config.id);
    }
    if (instancesRepo !== undefined) {
      if (config.fiches.length === 1) {
        activeInstance = await ensureMonoFicheInstance(
          instancesRepo,
          config,
          conversation.id,
          organizationId,
        );
      } else {
        const instances = await instancesRepo.listByConversation(organizationId, conversation.id);
        activeInstance =
          instances.find((instance) => instance.status === "active") ??
          instanceForFiche(instances, config.fiches[0]?.key ?? "");
      }
    }
    attachmentFields =
      config.fiches.length === 1
        ? (config.fiches[0]?.fields ?? [])
        : config.fiches.flatMap((fiche) => fiche.fields);
  } else {
    const template = await deps.templates.findVersion(
      organizationId,
      link.templateKey,
      link.templateVersion,
    );
    if (template === null) {
      throw new NotFoundError("Modèle de raisonnement introuvable");
    }
    templateDefinition = template.definition;
    attachmentFields = template.definition.fields;
  }

  await validateAttachments(deps, organizationId, conversation.id, attachmentFields, attachmentIds);

  const userMessage = await deps.conversations.appendMessage(
    organizationId,
    conversation.id,
    "user",
    content,
    attachmentIds,
  );
  if (conversation.interventionMode === "human") {
    return {
      organizationId,
      userMessage,
      message: null,
      connaissances: [],
      mediaPending: false,
      mode: "human",
    };
  }
  if (content === "") {
    return {
      organizationId,
      userMessage,
      message: null,
      connaissances: [],
      mediaPending: false,
      mode: conversation.interventionMode,
    };
  }

  // Historique borné : les tours anciens n'apportent rien au cadrage.
  const HISTORY_LIMIT = 20;
  const history = (await deps.conversations.listMessages(organizationId, conversation.id)).slice(
    -HISTORY_LIMIT,
  );
  const target = {
    organizationId,
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  };
  const ai =
    deps.ai.forUsage === undefined
      ? await deps.ai.forTarget(target)
      : fallbackAiClient(await deps.ai.forUsage(target, "response", link.id));
  const recordUsage = async (operation: string, usage: AiTokenUsage): Promise<void> => {
    await deps.links.recordAiUsage?.(organizationId, link.id, {
      conversationId: conversation.id,
      operation,
      ...usage,
    });
  };

  if (config !== null) {
    if (config.fiches.length > 1 && instancesRepo !== undefined) {
      const detected = await detectFicheInstances({
        ai: withAiUsage(ai, recordUsage, "fiche_detection"),
        config,
        messages: history.map((message) => ({
          role: toAiRole(message.role),
          content: message.content,
        })),
      });
      activeInstance =
        detected === null
          ? await fallbackToPrimaryFiche({
              repo: instancesRepo,
              config,
              conversationId: conversation.id,
              organizationId,
            })
          : await applyFicheDetection({
              repo: instancesRepo,
              config,
              conversationId: conversation.id,
              organizationId,
              detected,
            });
    }
    const activeFiche = activeInstance === null ? null : findFiche(config, activeInstance.ficheKey);
    const fiche = activeFiche ?? config.fiches[0] ?? null;
    if (fiche !== null) templateDefinition = ficheToDefinition(config, fiche);
  }
  if (templateDefinition === null && config !== null) {
    templateDefinition = conversationOnlyDefinition(config);
  }
  const definition = templateDefinition;
  if (definition === null) {
    throw new NotFoundError("Configuration du chatbot introuvable");
  }

  let prospect = null;
  if (link.type === "specifique" && link.prospectId !== null) {
    prospect = await deps.prospects.findById(organizationId, link.prospectId);
  }

  const system = buildSystemPromptFromTemplate({
    definition,
    serverVars: buildServerVariables({ mode: link.type, prospect, conversation }),
  });

  // Métadonnées des pièces (jamais leur contenu) pour que l'IA demande les
  // champs fichier manquants, y compris les champs requis (ADR-0034).
  const conversationAttachments = await deps.attachments.listByConversation(
    organizationId,
    conversation.id,
  );
  const attachmentContext = buildAttachmentPromptContext(
    definition.fields,
    conversationAttachments,
  );
  let systemEnrichi =
    attachmentContext === ""
      ? system
      : `${system}

${attachmentContext}`;
  let connaissances: ConnaissanceRef[] = [];
  if (link.sources.connaissances) {
    const actives = await listRuntimeConnaissances(deps, organizationId, link, config);
    const utiles = await selectConnaissancesUtiles(
      { ai: withAiUsage(ai, recordUsage, "knowledge_selection") },
      actives,
      content,
    );
    if (utiles.length > 0) {
      systemEnrichi = `${systemEnrichi}\n\n${buildContexteInterne(utiles)}`;
      connaissances = utiles.map(toConnaissanceRef);
    }
    const refreshed = await deps.links.findById(organizationId, link.id);
    if (refreshed !== null) assertChatLinkAvailable(refreshed);
  }

  // Les contextes runtime (pièces jointes, RAG) sont en français : on rappelle
  // la politique de langue du modèle simple en dernier.
  if (definition.simple !== undefined) {
    systemEnrichi = `${systemEnrichi}\n\n${languageReminder(definition.simple.language)}`;
  }

  let answer: string;
  try {
    answer = await withAiUsage(ai, recordUsage, "chat_reply").complete({
      system: systemEnrichi,
      messages: history.map((message) => ({
        role: toAiRole(message.role),
        content: message.content,
      })),
      maxTokens: 400,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new BadGatewayError("Service IA momentanément indisponible, réessayez");
  }

  // Course IA/opérateur : si un humain a pris la main pendant la génération,
  // la réponse IA ne doit jamais être écrite après la prise en main.
  const latest = await deps.conversations.findByIdPublic(conversation.id);
  if (latest === null || latest.interventionMode === "human") {
    return {
      organizationId,
      userMessage,
      message: null,
      connaissances: [],
      mediaPending: false,
      mode: "human",
    };
  }

  const message = await deps.conversations.appendMessage(
    organizationId,
    conversation.id,
    "assistant",
    answer,
  );
  const mediaPending = await hasEligibleMedia(deps, organizationId, link, config);
  return {
    organizationId,
    userMessage,
    message,
    mediaPending,
    connaissances,
    mode: latest.interventionMode,
  };
}
