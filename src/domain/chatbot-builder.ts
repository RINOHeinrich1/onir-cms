import { type ChatbotMission, isChatbotMission } from "@/domain/entities/chatbot-information";
import type { TemplateLanguagePolicy } from "@/domain/template-settings";

export const BUILD_DESCRIPTION_MAX = 4_000;
export const BUILD_COLLECTION_GOAL_MAX = 1_000;
export const BUILD_MESSAGE_MAX = 4_000;
export const BUILD_MESSAGES_MAX = 60;
export const BUILD_DOCUMENTS_MAX = 5;
export const BUILD_SOURCE_TEXT_MAX = 24_000;

export type ChatbotBuildDocument = {
  name: string;
  size: number;
};

export type ChatbotBuildSourceIntent = {
  fiches: boolean;
  connaissances: boolean;
  medias: boolean;
};

export type ChatbotBuildBrief = {
  description: string | null;
  mission: ChatbotMission | null;
  collectionGoal: string | null;
  identity: {
    label: string | null;
    role: string | null;
    objective: string | null;
  };
  sources: {
    websiteUrl: string | null;
    documents: ChatbotBuildDocument[];
    useDescriptionAsSource: boolean;
    intent: ChatbotBuildSourceIntent;
    ficheTypes: string[];
    mediaTypes: Array<"photo" | "lien">;
  };
  behavior: {
    language: TemplateLanguagePolicy;
    tone: string;
    guardrails: string[];
    extraInstructions: string;
  };
  publication: {
    page: boolean;
    widget: boolean;
    templateId: string | null;
    templateVersion: string | null;
  };
  limits: {
    replyMaxTokens: number;
    maxFiches: number | null;
    maxTokens: number | null;
    expiresAt: string | null;
  };
  overrides: {
    aiProviderId: string | null;
    aiModel: string | null;
  };
};

export type ChatbotBuildMessage = {
  role: "assistant" | "user";
  content: string;
};

export type ChatbotBuildSession = {
  id: string;
  status: "collecting" | "ready" | "done" | "abandoned";
  messages: ChatbotBuildMessage[];
  brief: ChatbotBuildBrief;
  missingMandatory: ChatbotRequirement[];
  suggestions: string[];
  warnings: string[];
  version: number;
};

export type ChatbotRequirement = "description" | "mission" | "source" | "collection_goal";

export const BUILD_REQUIREMENT_LABELS: Record<ChatbotRequirement, string> = {
  description: "Décrire le besoin",
  mission: "Choisir la mission",
  source: "Choisir au moins une source",
  collection_goal: "Définir ce que le chatbot doit collecter",
};

export function emptyBuildBrief(): ChatbotBuildBrief {
  return {
    description: null,
    mission: null,
    collectionGoal: null,
    identity: { label: null, role: null, objective: null },
    sources: {
      websiteUrl: null,
      documents: [],
      useDescriptionAsSource: false,
      intent: { fiches: false, connaissances: false, medias: false },
      ficheTypes: [],
      mediaTypes: [],
    },
    behavior: {
      language: { mode: "auto" },
      tone: "",
      guardrails: [],
      extraInstructions: "",
    },
    publication: {
      page: true,
      widget: false,
      templateId: null,
      templateVersion: null,
    },
    limits: {
      replyMaxTokens: 400,
      maxFiches: null,
      maxTokens: null,
      expiresAt: null,
    },
    overrides: { aiProviderId: null, aiModel: null },
  };
}

export function emptyBuildSession(): ChatbotBuildSession {
  return {
    id: "",
    status: "collecting",
    messages: [],
    brief: emptyBuildBrief(),
    missingMandatory: ["description", "mission"],
    suggestions: [],
    warnings: [],
    version: 1,
  };
}

export function assistantGreeting(): string {
  return "Bonjour, je vais vous aider à créer votre chatbot. Pour commencer, que doit-il faire, et pour qui ?";
}

/** Messages utilisateur du brief, sans les réponses de l’assistant. */
export function briefMessages(session: ChatbotBuildSession): string[] {
  return session.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((message) => message !== "");
}

/** Texte source brut fourni par l’utilisateur, sans le résumé généré par l’IA. */
export function briefSourceText(
  session: ChatbotBuildSession,
  maxChars = BUILD_SOURCE_TEXT_MAX,
): string {
  return briefMessages(session).join("\n\n").slice(0, maxChars);
}

export function hasSource(brief: ChatbotBuildBrief): boolean {
  return (
    (brief.sources.websiteUrl?.trim() ?? "") !== "" ||
    brief.sources.documents.length > 0 ||
    (brief.sources.useDescriptionAsSource && (brief.description?.trim() ?? "") !== "") ||
    (brief.sources.intent.fiches && brief.sources.ficheTypes.length > 0) ||
    (brief.sources.intent.medias && brief.sources.mediaTypes.length > 0)
  );
}

export function missingBuildRequirements(brief: ChatbotBuildBrief): ChatbotRequirement[] {
  const missing: ChatbotRequirement[] = [];
  if ((brief.description?.trim() ?? "") === "") missing.push("description");
  if (brief.mission === null) missing.push("mission");
  if (brief.mission === "inform" || brief.mission === "hybrid") {
    if (!hasSource(brief)) missing.push("source");
  }
  if (brief.mission === "collect" || brief.mission === "hybrid") {
    if ((brief.collectionGoal?.trim() ?? "") === "") missing.push("collection_goal");
  }
  return missing;
}

export function effectiveSourceIntent(brief: ChatbotBuildBrief): ChatbotBuildSourceIntent {
  if (brief.mission === "collect") {
    return { fiches: false, connaissances: false, medias: false };
  }
  return {
    fiches: brief.sources.intent.fiches && brief.sources.ficheTypes.length > 0,
    connaissances:
      brief.sources.useDescriptionAsSource ||
      (brief.sources.intent.connaissances &&
        ((brief.sources.websiteUrl?.trim() ?? "") !== "" || brief.sources.documents.length > 0)),
    medias: brief.sources.intent.medias && brief.sources.mediaTypes.length > 0,
  };
}

export function normalizeBuildBrief(brief: ChatbotBuildBrief): ChatbotBuildBrief {
  const description = brief.description?.trim() ?? "";
  const collectionGoal = brief.collectionGoal?.trim() ?? "";
  const websiteUrl = brief.sources.websiteUrl?.trim() ?? "";
  const mission = brief.mission;
  const intent = effectiveSourceIntent({ ...brief, mission });
  const hasExternalSource =
    websiteUrl !== "" ||
    brief.sources.documents.length > 0 ||
    (brief.sources.intent.fiches && brief.sources.ficheTypes.length > 0) ||
    (brief.sources.intent.medias && brief.sources.mediaTypes.length > 0);
  const useDescriptionAsSource =
    mission === "collect"
      ? false
      : brief.sources.useDescriptionAsSource || (description !== "" && !hasExternalSource);
  return {
    ...brief,
    description: description === "" ? null : description.slice(0, BUILD_DESCRIPTION_MAX),
    collectionGoal:
      mission === "collect" || mission === "hybrid"
        ? collectionGoal === ""
          ? null
          : collectionGoal.slice(0, BUILD_COLLECTION_GOAL_MAX)
        : null,
    sources: {
      ...brief.sources,
      websiteUrl: websiteUrl === "" ? null : websiteUrl,
      documents: brief.sources.documents.slice(0, BUILD_DOCUMENTS_MAX),
      useDescriptionAsSource,
      intent: {
        ...brief.sources.intent,
        ...(mission === "collect"
          ? { fiches: false, connaissances: false, medias: false }
          : { connaissances: useDescriptionAsSource || intent.connaissances }),
      },
      ficheTypes: [...new Set(brief.sources.ficheTypes)],
      mediaTypes: [...new Set(brief.sources.mediaTypes)],
    },
    behavior: {
      ...brief.behavior,
      tone: brief.behavior.tone.slice(0, 200),
      guardrails: [...new Set(brief.behavior.guardrails)].slice(0, 20),
      extraInstructions: brief.behavior.extraInstructions.slice(0, 4_000),
    },
    limits: {
      ...brief.limits,
      replyMaxTokens:
        Number.isInteger(brief.limits.replyMaxTokens) &&
        brief.limits.replyMaxTokens >= 100 &&
        brief.limits.replyMaxTokens <= 2_000
          ? brief.limits.replyMaxTokens
          : 400,
    },
  };
}

export function withBuildDerivedState(session: ChatbotBuildSession): ChatbotBuildSession {
  const brief = normalizeBuildBrief(session.brief);
  const missingMandatory = missingBuildRequirements(brief);
  return {
    ...session,
    brief,
    missingMandatory,
    status: missingMandatory.length === 0 ? "ready" : "collecting",
    suggestions: session.suggestions.slice(0, 6),
    messages: session.messages.slice(-BUILD_MESSAGES_MAX),
  };
}

export function nextBuildQuestion(requirement: ChatbotRequirement): string {
  switch (requirement) {
    case "description":
      return "Pouvez-vous me décrire en quelques phrases ce que doit faire le chatbot, et à qui il s’adresse ?";
    case "mission":
      return "Doit-il collecter des informations auprès des visiteurs, informer à partir de vos contenus, ou faire les deux ?";
    case "source":
      return "Sur quelles informations doit-il s’appuyer ? Ajoutez un site web ou des documents dans le panneau des sources.";
    case "collection_goal":
      return "Quelles informations doit-il collecter auprès des visiteurs ? Par exemple : nom, besoin, budget ou coordonnées.";
  }
}

export function buildSessionFromState(
  state: Record<string, unknown>,
  draftId: string,
): ChatbotBuildSession | null {
  const raw = record(state.builder);
  if (Object.keys(raw).length === 0) return null;
  const base = emptyBuildBrief();
  const briefRaw = record(raw.brief);
  const identity = record(briefRaw.identity);
  const sources = record(briefRaw.sources);
  const intent = record(sources.intent);
  const behavior = record(briefRaw.behavior);
  const language = record(behavior.language);
  const publication = record(briefRaw.publication);
  const limits = record(briefRaw.limits);
  const overrides = record(briefRaw.overrides);

  const documents: ChatbotBuildDocument[] = Array.isArray(sources.documents)
    ? sources.documents.flatMap((entry) => {
        const item = record(entry);
        const name = text(item.name);
        if (name === "") return [];
        return [{ name, size: number(item.size) }];
      })
    : [];

  const ficheTypes = stringArray(sources.ficheTypes);
  const mediaTypes = stringArray(sources.mediaTypes).filter(
    (entry): entry is "photo" | "lien" => entry === "photo" || entry === "lien",
  );

  const brief = normalizeBuildBrief({
    ...base,
    description: optionalText(briefRaw.description),
    mission: isChatbotMission(briefRaw.mission) ? briefRaw.mission : null,
    collectionGoal: optionalText(briefRaw.collectionGoal),
    identity: {
      label: optionalText(identity.label),
      role: optionalText(identity.role),
      objective: optionalText(identity.objective),
    },
    sources: {
      websiteUrl: optionalText(sources.websiteUrl),
      documents,
      useDescriptionAsSource: bool(sources.useDescriptionAsSource, false),
      intent: {
        fiches: bool(intent.fiches, false),
        connaissances: bool(intent.connaissances, false),
        medias: bool(intent.medias, false),
      },
      ficheTypes,
      mediaTypes,
    },
    behavior: {
      language:
        language.mode === "fixed" && typeof language.value === "string"
          ? { mode: "fixed", value: language.value }
          : { mode: "auto" },
      tone: text(behavior.tone),
      guardrails: stringArray(behavior.guardrails),
      extraInstructions: text(behavior.extraInstructions),
    },
    publication: {
      page: bool(publication.page, true),
      widget: bool(publication.widget, false),
      templateId: optionalText(publication.templateId),
      templateVersion: optionalText(publication.templateVersion),
    },
    limits: {
      replyMaxTokens: number(limits.replyMaxTokens) || base.limits.replyMaxTokens,
      maxFiches: optionalNumber(limits.maxFiches),
      maxTokens: optionalNumber(limits.maxTokens),
      expiresAt: optionalText(limits.expiresAt),
    },
    overrides: {
      aiProviderId: optionalText(overrides.aiProviderId),
      aiModel: optionalText(overrides.aiModel),
    },
  });

  const messages: ChatbotBuildMessage[] = Array.isArray(raw.messages)
    ? raw.messages.flatMap((entry) => {
        const item = record(entry);
        const role = item.role === "user" || item.role === "assistant" ? item.role : null;
        const content = text(item.content);
        if (role === null || content === "") return [];
        return [
          { role: role as "assistant" | "user", content: content.slice(0, BUILD_MESSAGE_MAX) },
        ];
      })
    : [];
  const normalizedMessages =
    messages.length > 0
      ? messages.slice(-BUILD_MESSAGES_MAX)
      : [{ role: "assistant" as const, content: assistantGreeting() }];

  return withBuildDerivedState({
    id: draftId,
    status: raw.status === "done" || raw.status === "abandoned" ? raw.status : "collecting",
    messages: normalizedMessages,
    brief,
    missingMandatory: [],
    suggestions: stringArray(raw.suggestions),
    warnings: stringArray(raw.warnings),
    version: number(raw.version) || 1,
  });
}

export function isBuilderDraftState(state: Record<string, unknown>): boolean {
  return Object.keys(record(state.builder)).length > 0;
}

export function serializeBuildSession(session: ChatbotBuildSession): Record<string, unknown> {
  return {
    builder: {
      status: session.status,
      messages: session.messages,
      brief: session.brief,
      suggestions: session.suggestions,
      warnings: session.warnings,
      version: session.version,
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const entry = text(value);
  return entry === "" ? null : entry;
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
    : [];
}
