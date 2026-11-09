import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  AiNotConfiguredError,
  AppError,
  BadGatewayError,
  NotFoundError,
  ValidationError,
} from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type {
  ChatbotBuildSessionRepository,
  StoredChatbotBuildSession,
} from "@/application/ports/chatbot-build-session-repository";
import type { DocumentTextExtractor } from "@/application/ports/document-text-extractor";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import type { WebsiteContextReader } from "@/application/ports/website-context-reader";
import {
  type ChatbotAiGenerationResult,
  type ChatbotAiUploadFile,
  generateChatbotAiDraft,
} from "@/application/use-cases/chatbots/generate-chatbot-ai-draft";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import { resolveDefaultStarterTemplate } from "@/application/use-cases/visual-templates/resolve-default-starter-template";
import {
  assistantGreeting,
  BUILD_DOCUMENTS_MAX,
  BUILD_MESSAGE_MAX,
  briefMessages,
  briefSourceText,
  type ChatbotBuildDocument,
  type ChatbotBuildSession,
  type ChatbotBuildSourceIntent,
  emptyBuildSession,
  normalizeBuildBrief,
  withBuildDerivedState,
} from "@/domain/chatbot-builder";
import type { ChatbotMission } from "@/domain/entities/chatbot-information";
import type { TemplateParamValues } from "@/domain/template-params";
import { buildChatbotBuilderPrompt } from "./chatbot-builder-prompt";
import { applyBuildPatch, parseChatbotBuildTurn } from "./parse-build-turn";

export type ChatbotBuilderDependencies = {
  sessions: ChatbotBuildSessionRepository;
  aiFactory: AiClientFactory;
  documents: DocumentTextExtractor;
  websites: WebsiteContextReader;
  visualTemplates: VisualTemplateRepository;
};

export type ChatbotBuilderVisualTemplate = {
  templateId: string;
  version: string;
  params: TemplateParamValues;
  colorParamKeys: string[];
  warnings: string[];
};

export type ChatbotBuilderGeneration = ChatbotAiGenerationResult & {
  mission: ChatbotMission;
  sourceIntent: ChatbotBuildSourceIntent;
  visualTemplate: ChatbotBuilderVisualTemplate | null;
};

function greetingSession(): ChatbotBuildSession {
  return withBuildDerivedState({
    ...emptyBuildSession(),
    messages: [{ role: "assistant", content: assistantGreeting() }],
    suggestions: [
      "Créer un chatbot pour collecter des prospects",
      "Informer à partir de mes documents",
      "Un chatbot hybride : informer et collecter",
    ],
  });
}

function cleanMessage(value: unknown): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (message === "") throw new ValidationError("Message vide");
  return message.slice(0, BUILD_MESSAGE_MAX);
}

function parseWebsite(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseDocuments(value: unknown): ChatbotBuildDocument[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const documents: ChatbotBuildDocument[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name === "" || seen.has(name)) continue;
    const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
    seen.add(name);
    documents.push({ name: name.slice(0, 255), size });
    if (documents.length >= BUILD_DOCUMENTS_MAX) break;
  }
  return documents;
}

async function resolveAssistantClient(deps: ChatbotBuilderDependencies, organizationId: string) {
  const target = { organizationId, aiProviderId: null, aiModel: null };
  try {
    const resolved =
      deps.aiFactory.resolveForUsage === undefined
        ? await deps.aiFactory.resolve(target)
        : await deps.aiFactory.resolveForUsage(target, "assistant");
    const resolvedTarget =
      resolved.providerId === null
        ? target
        : {
            organizationId,
            aiProviderId: resolved.providerId,
            aiModel: resolved.model,
            aiClusterId: resolved.clusterId ?? null,
          };
    return {
      client: await deps.aiFactory.forTarget(resolvedTarget, "assistant"),
      providerLabel: resolved.providerLabel,
      model: resolved.model,
    };
  } catch (error) {
    if (error instanceof AiNotConfiguredError || error instanceof AppError) throw error;
    throw new BadGatewayError("Aucun fournisseur IA disponible pour l’assistant de création");
  }
}

export async function startChatbotBuildSession(
  deps: ChatbotBuilderDependencies,
  actor: Actor,
): Promise<StoredChatbotBuildSession> {
  assertCan(actor, "links:create");
  return deps.sessions.create(organizationOf(actor), actor.id, greetingSession());
}

export async function getChatbotBuildSession(
  deps: ChatbotBuilderDependencies,
  actor: Actor,
  draftId: string,
): Promise<StoredChatbotBuildSession> {
  assertCan(actor, "links:create");
  const stored = await deps.sessions.find(organizationOf(actor), draftId);
  if (stored === null) throw new NotFoundError("Session de création introuvable");
  return stored;
}

export async function updateChatbotBuildSources(
  deps: ChatbotBuilderDependencies,
  actor: Actor,
  draftId: string,
  input: unknown,
): Promise<StoredChatbotBuildSession> {
  assertCan(actor, "links:update");
  const stored = await deps.sessions.find(organizationOf(actor), draftId);
  if (stored === null) throw new NotFoundError("Session de création introuvable");

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const websiteUrl = parseWebsite(source.websiteUrl);
  const documents = parseDocuments(source.documents);
  const useDescriptionAsSource =
    typeof source.useDescriptionAsSource === "boolean"
      ? source.useDescriptionAsSource
      : stored.session.brief.sources.useDescriptionAsSource;
  const brief = normalizeBuildBrief({
    ...stored.session.brief,
    sources: {
      ...stored.session.brief.sources,
      websiteUrl,
      documents,
      useDescriptionAsSource,
      intent: {
        ...stored.session.brief.sources.intent,
        connaissances: websiteUrl !== null || documents.length > 0 || useDescriptionAsSource,
      },
    },
  });
  const session = withBuildDerivedState({ ...stored.session, brief });
  const saved = await deps.sessions.save(organizationOf(actor), draftId, session);
  if (saved === null) throw new NotFoundError("Session de création introuvable");
  return saved;
}

export async function deleteChatbotBuildSession(
  deps: ChatbotBuilderDependencies,
  actor: Actor,
  draftId: string,
): Promise<void> {
  assertCan(actor, "links:create");
  const deleted = await deps.sessions.delete(organizationOf(actor), draftId);
  if (!deleted) throw new NotFoundError("Session de création introuvable");
}

export async function continueChatbotBuildSession(
  deps: ChatbotBuilderDependencies,
  actor: Actor,
  draftId: string,
  input: unknown,
): Promise<StoredChatbotBuildSession> {
  assertCan(actor, "links:create");
  const stored = await deps.sessions.find(organizationOf(actor), draftId);
  if (stored === null) throw new NotFoundError("Session de création introuvable");

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const userMessage = cleanMessage(source.message);
  const withUser = withBuildDerivedState({
    ...stored.session,
    messages: [...stored.session.messages, { role: "user" as const, content: userMessage }].slice(
      -60,
    ),
  });

  const { client } = await resolveAssistantClient(deps, organizationOf(actor));
  const prompt = buildChatbotBuilderPrompt(withUser, userMessage);
  const raw = await callStructuredAi(client, prompt);
  const turn = parseChatbotBuildTurn(raw);
  const session = applyBuildPatch(withUser, turn);

  const saved = await deps.sessions.save(organizationOf(actor), draftId, session);
  if (saved === null) throw new NotFoundError("Session de création introuvable");
  return saved;
}

export function postProcessDraft(
  result: ChatbotAiGenerationResult,
  mission: ChatbotMission,
): Omit<ChatbotBuilderGeneration, "visualTemplate"> {
  const draft = {
    ...result.draft,
    fields: [...result.draft.fields],
    knowledge: [...result.draft.knowledge],
    fallback: { ...result.draft.fallback, questions: [...result.draft.fallback.questions] },
    warnings: [...result.draft.warnings],
  };

  if (mission === "inform") {
    if (draft.fields.length > 0) {
      draft.warnings.push(
        "Mission informative : les champs de collecte proposés ont été ignorés (aucune fiche générée).",
      );
    }
    draft.fields = [];
    draft.fallback.showCollectionForm = false;
  } else if (mission === "collect") {
    if (draft.knowledge.length > 0) {
      draft.knowledge = [];
      draft.warnings.push(
        "Mission de collecte : les connaissances extraites ne sont pas rattachées comme source.",
      );
    }
  } else if (draft.fields.length === 0) {
    throw new ValidationError(
      "L’IA n’a pas proposé de champs de collecte. Précisez ce que le chatbot doit collecter.",
    );
  }

  if (mission !== "inform" && draft.fields.length > 0) {
    draft.fallback.showCollectionForm = true;
  }

  if (mission !== "inform" && draft.fields.length === 0) {
    throw new ValidationError(
      "Aucune fiche de collecte générée. Précisez les informations à collecter.",
    );
  }

  return {
    ...result,
    draft,
    mission,
    sourceIntent:
      mission === "collect"
        ? { fiches: false, connaissances: false, medias: false }
        : {
            fiches: false,
            connaissances: result.draft.knowledge.length > 0,
            medias: false,
          },
  };
}

export async function generateChatbotFromBuildSession(
  deps: ChatbotBuilderDependencies,
  actor: Actor,
  draftId: string,
  files: ChatbotAiUploadFile[],
  options: { providerId?: string; model?: string } = {},
): Promise<ChatbotBuilderGeneration> {
  assertCan(actor, "links:create");
  const stored = await deps.sessions.find(organizationOf(actor), draftId);
  if (stored === null) throw new NotFoundError("Session de création introuvable");
  const session = stored.session;
  if (session.missingMandatory.length > 0) {
    throw new ValidationError(`Prérequis manquants : ${session.missingMandatory.join(", ")}`);
  }
  if (session.brief.mission === null) {
    throw new ValidationError("La mission du chatbot est obligatoire");
  }
  if (session.brief.sources.documents.length > 0 && files.length === 0) {
    throw new ValidationError(
      "Les documents de cette session doivent être rattachés à nouveau avant la génération.",
    );
  }

  const collectionContext =
    session.brief.mission === "collect" || session.brief.mission === "hybrid"
      ? session.brief.collectionGoal
      : null;
  const description = [
    session.brief.description ?? "",
    collectionContext === null ? "" : `\n\nInformations à collecter : ${collectionContext}`,
  ]
    .join("")
    .trim();

  const result = await generateChatbotAiDraft(deps, actor, {
    description,
    websiteUrl: session.brief.sources.websiteUrl ?? "",
    files,
    ...(options.providerId === undefined ? {} : { providerId: options.providerId }),
    ...(options.model === undefined ? {} : { model: options.model }),
    mission: session.brief.mission,
    descriptionAsSource: session.brief.sources.useDescriptionAsSource,
    briefMessages: briefMessages(session),
  });

  const generation = postProcessDraft(result, session.brief.mission);
  const starter = await resolveDefaultStarterTemplate(deps.visualTemplates, organizationOf(actor));
  const visualTemplate: ChatbotBuilderVisualTemplate | null =
    starter.template === null
      ? null
      : {
          templateId: starter.template.templateId,
          version: starter.template.version,
          params: starter.template.params,
          colorParamKeys: starter.template.colorParamKeys,
          warnings: starter.warnings,
        };
  generation.warnings.push(...starter.warnings);
  if (
    session.brief.sources.useDescriptionAsSource &&
    (session.brief.mission === "inform" || session.brief.mission === "hybrid") &&
    generation.draft.knowledge.length === 0
  ) {
    generation.draft.knowledge.push({
      titre: "Informations fournies",
      contenu: briefSourceText(session).slice(0, 8_000),
    });
    generation.sourceIntent.connaissances = true;
    generation.warnings.push(
      "Les informations du texte fourni ont été ajoutées comme connaissance de secours.",
    );
  }
  const savedSession = withBuildDerivedState({
    ...session,
    warnings: [...new Set([...session.warnings, ...generation.warnings])],
  });
  await deps.sessions.save(organizationOf(actor), draftId, savedSession);
  return { ...generation, visualTemplate };
}

export type { ChatbotBuildSourceIntent };
