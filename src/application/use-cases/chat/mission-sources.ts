import type { AiClient } from "@/application/ports/ai-client";
import type { ChatSearchSessionRepository } from "@/application/ports/chat-search-session-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheCollecteRepository } from "@/application/ports/fiche-collecte-repository";
import type { FicheToolRepository } from "@/application/ports/fiche-tool-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import { type RecordAiUsage, withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import { toModelItems, toTemplateBlocks } from "@/application/use-cases/chat/tool-loop";
import {
  buildContexteInterne,
  selectConnaissancesUtiles,
} from "@/application/use-cases/connaissances/select-connaissances";
import { planFicheSearch } from "@/application/use-cases/fiches/plan-fiche-search";
import {
  executeFicheTool,
  type FicheToolContext,
} from "@/application/use-cases/fiches/tool-search";
import type { ChatLink, ChatMessage } from "@/domain/entities/chat";
import type { ChatbotConfig, ChatbotDataSelection } from "@/domain/entities/chatbot-config";
import type {
  ChatbotInformationSources,
  ChatbotMediasSource,
} from "@/domain/entities/chatbot-information";
import type { ConnaissanceRef } from "@/domain/entities/connaissance";
import type { Media } from "@/domain/entities/media";
import type { MessageBlock } from "@/domain/tool-blocks";
import { signedMediaUrl } from "@/lib/media-token";
import { listRuntimeConnaissances, listRuntimeMedias } from "./chatbot-data-runtime";
import type { SourcePlan } from "./intent-analysis";
import type { InformationSourceKey } from "./runtime-plan";

export type MissionSourceDependencies = {
  connaissances: ConnaissanceRepository;
  medias: MediaRepository;
  conversations: ConversationRepository;
  configs?: ChatbotConfigRepository;
  ficheTools?: FicheToolRepository;
  searchSessions?: ChatSearchSessionRepository;
  ficheCollectes?: FicheCollecteRepository;
};

export type MissionSourceResult = {
  key: InformationSourceKey;
  label: string;
  context: string;
  blocks: MessageBlock[];
  connaissances: ConnaissanceRef[];
  medias: Media[];
  error?: string;
};

function selection(
  source: { mode: "all" | "selected"; ids: string[] },
  kind: "connaissances" | "medias",
): ChatbotDataSelection {
  return {
    mode: source.mode,
    connaissanceIds: kind === "connaissances" ? source.ids : [],
    mediaIds: kind === "medias" ? source.ids : [],
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function requestedQuery(plan: SourcePlan, content: string): string {
  return plan.query.trim() === "" ? content : plan.query;
}

async function executeFichesSource(input: {
  deps: MissionSourceDependencies;
  organizationId: string;
  link: ChatLink;
  conversationId: string;
  config: ChatbotConfig;
  sources: ChatbotInformationSources;
  plan: SourcePlan;
  content: string;
  history: readonly ChatMessage[];
  ai: AiClient;
  recordUsage: RecordAiUsage;
}): Promise<MissionSourceResult> {
  const source = input.sources.fiches;
  if (input.deps.ficheTools === undefined || input.deps.searchSessions === undefined) {
    return {
      key: "fiches",
      label: source.label,
      context: "",
      blocks: [],
      connaissances: [],
      medias: [],
      error: "Recherche de fiches indisponible",
    };
  }
  const collectes =
    input.deps.ficheCollectes === undefined
      ? input.config.fiches
      : await input.deps.ficheCollectes.list(input.organizationId);
  const searchable = collectes.map((fiche) => ({
    key: fiche.key,
    label: fiche.label,
    fields: fiche.fields,
    ...(fiche.statuses === undefined ? {} : { statuses: fiche.statuses }),
  }));
  const toolContext: FicheToolContext = {
    organizationId: input.organizationId,
    chatLinkId: input.link.id,
    conversationId: input.conversationId,
    config: source,
    fiches: searchable,
    deps: {
      fiches: input.deps.ficheTools,
      sessions: input.deps.searchSessions,
    },
  };
  const searchPlan = await planFicheSearch({
    ai: input.ai,
    recordUsage: input.recordUsage,
    message: input.content,
    history: input.history,
    config: source,
    definitions: searchable,
  });
  if (searchPlan.request === null) {
    return {
      key: "fiches",
      label: source.label,
      context: "",
      blocks: [],
      connaissances: [],
      medias: [],
      error: "Aucun plan de recherche exploitable",
    };
  }
  const result = await executeFicheTool(toolContext, "search_fiches", searchPlan.request);
  const modelItems = toModelItems(result);
  const prefix = searchPlan.fallback
    ? `Aucun critère structuré exploitable. Recherche élargie dans la portée ${source.label} :`
    : `Résultats de la source ${source.label} :`;
  return {
    key: "fiches",
    label: source.label,
    context: modelItems === null ? "" : `${prefix}\n${JSON.stringify(modelItems)}`,
    blocks: toTemplateBlocks("search_fiches", result),
    connaissances: [],
    medias: [],
  };
}

async function executeConnaissancesSource(input: {
  deps: MissionSourceDependencies;
  organizationId: string;
  link: ChatLink;
  config: ChatbotConfig;
  sources: ChatbotInformationSources;
  plan: SourcePlan;
  content: string;
  ai: AiClient;
  recordUsage: RecordAiUsage;
}): Promise<MissionSourceResult> {
  const source = input.sources.connaissances;
  const config: ChatbotConfig = {
    ...input.config,
    dataSelection: selection(source.selection, "connaissances"),
  };
  const actives = await listRuntimeConnaissances(
    input.deps,
    input.organizationId,
    input.link,
    config,
  );
  const utiles = await selectConnaissancesUtiles(
    { ai: withAiUsage(input.ai, input.recordUsage, "knowledge_selection") },
    actives,
    requestedQuery(input.plan, input.content),
  );
  return {
    key: "connaissances",
    label: "Connaissances",
    context: buildContexteInterne(utiles) || "",
    blocks: [],
    connaissances: utiles.map((entry) => ({ ref: entry.id, titre: entry.titre })),
    medias: [],
  };
}

async function executeMediasSource(input: {
  deps: MissionSourceDependencies;
  organizationId: string;
  link: ChatLink;
  config: ChatbotConfig;
  sources: ChatbotInformationSources;
  plan: SourcePlan;
  content: string;
}): Promise<MissionSourceResult> {
  const source: ChatbotMediasSource = input.sources.medias;
  if (source.access !== "on_demand") {
    return {
      key: "medias",
      label: "Photos et liens",
      context: "",
      blocks: [],
      connaissances: [],
      medias: [],
    };
  }
  const config: ChatbotConfig = {
    ...input.config,
    dataSelection: selection(source.selection, "medias"),
  };
  const types = source.types.length > 0 ? source.types : (["photo", "lien"] as const);
  const all = (
    await Promise.all(
      types.map((type) =>
        listRuntimeMedias(input.deps, input.organizationId, input.link, type, config),
      ),
    )
  ).flat();
  const query = normalize(requestedQuery(input.plan, input.content));
  const filtered =
    query === ""
      ? all
      : all.filter((media) => normalize(`${media.libelle} ${media.description}`).includes(query));
  const medias = filtered.slice(0, source.maxResults);
  return {
    key: "medias",
    label: "Photos et liens",
    context:
      medias.length === 0
        ? ""
        : `Médias accessibles (Photos et liens) :\n${medias
            .map((media) => `- ${media.type} — ${media.libelle} : ${media.description}`)
            .join("\n")}`,
    blocks: [],
    connaissances: [],
    medias,
  };
}

export async function executeMissionSource(input: {
  deps: MissionSourceDependencies;
  organizationId: string;
  link: ChatLink;
  conversationId: string;
  config: ChatbotConfig;
  sources: ChatbotInformationSources;
  plan: SourcePlan;
  content: string;
  history: readonly ChatMessage[];
  ai: AiClient;
  recordUsage: RecordAiUsage;
}): Promise<MissionSourceResult> {
  if (input.plan.source === "fiches") {
    return executeFichesSource(input);
  }
  if (input.plan.source === "connaissances") {
    return executeConnaissancesSource(input);
  }
  return executeMediasSource(input);
}

export function toMissionMedia(
  media: Media,
  organizationId: string,
): { id: string; type: "photo" | "lien"; libelle: string; url: string; mime: string | null } {
  return {
    id: media.id,
    type: media.type,
    libelle: media.libelle,
    url: media.type === "photo" ? signedMediaUrl(media.id, organizationId) : (media.url ?? ""),
    mime: media.mime,
  };
}
