import type { AiClient } from "@/application/ports/ai-client";
import type { ChatMessage } from "@/domain/entities/chat";
import type {
  ChatbotInformationSources,
  ChatbotMission,
} from "@/domain/entities/chatbot-information";
import type { InformationSourceKey } from "./runtime-plan";

export type SourcePlan = {
  source: InformationSourceKey;
  query: string;
  limit?: number;
};

export type IntentAnalysis = {
  intent: "inform" | "collect" | "clarify";
  confidence: number;
  needsSources: boolean;
  sources: SourcePlan[];
  fallback: boolean;
};

const SOURCE_KEYS: InformationSourceKey[] = ["fiches", "connaissances", "medias"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sourceCatalog(
  sources: ChatbotInformationSources,
  allowed: InformationSourceKey[],
): string {
  return allowed
    .map((key) => {
      if (key === "fiches") {
        return `- fiches (${sources.fiches.label}) : ${sources.fiches.usageHint}`;
      }
      if (key === "connaissances") {
        return `- connaissances (${sources.connaissances.label}) : ${sources.connaissances.usageHint}`;
      }
      return `- medias (${sources.medias.label}) : ${sources.medias.usageHint}`;
    })
    .join("\n");
}

function parseSources(value: unknown, allowed: InformationSourceKey[]): SourcePlan[] {
  if (!Array.isArray(value)) return [];
  const result: SourcePlan[] = [];
  const seen = new Set<InformationSourceKey>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const source = entry.source;
    if (source !== "fiches" && source !== "connaissances" && source !== "medias") continue;
    if (!allowed.includes(source) || seen.has(source)) continue;
    seen.add(source);
    const limit = typeof entry.limit === "number" ? Math.trunc(entry.limit) : undefined;
    result.push({
      source,
      query: text(entry.query),
      ...(limit === undefined ? {} : { limit: Math.max(1, Math.min(20, limit)) }),
    });
  }
  return result;
}

/**
 * Analyse d'intention bornée (ADR-0068 §5.2). Elle ne répond jamais à la
 * question : elle choisit une intention et un plan de sources.
 */
export async function analyzeChatbotIntent(input: {
  ai: AiClient;
  message: string;
  history: readonly ChatMessage[];
  mission: ChatbotMission;
  sources: ChatbotInformationSources;
  allowedSources: InformationSourceKey[];
  collectionActive: boolean;
}): Promise<IntentAnalysis> {
  const allowed = input.allowedSources.filter((source) => SOURCE_KEYS.includes(source));
  const allowedIntents =
    input.mission === "hybrid" ? ["inform", "collect", "clarify"] : ["inform", "clarify"];
  const history = input.history
    .slice(-8)
    .map((message) => `${message.role === "user" ? "Visiteur" : "Assistant"} : ${message.content}`)
    .join("\n");
  const system = [
    "Tu es un routeur d'intention pour un chatbot.",
    "Tu ne réponds jamais à la question du visiteur.",
    "Tu renvoies uniquement un JSON strict.",
    `Missions autorisées : ${allowedIntents.join(", ")}.`,
    "Règles :",
    "- inform : le visiteur demande une information, une liste, un contact, une recommandation ou un média.",
    "- collect : le visiteur veut explicitement créer, inscrire ou compléter une fiche.",
    "- clarify : la demande est ambiguë ou il manque une information pour choisir.",
    "- Une demande mixte commence par inform, pas par collect.",
    "- Une collecte active et une réponse à la dernière question de collecte privilégient collect.",
    "- Tu ne peux utiliser que les sources listées.",
    "- Si aucune source n'est nécessaire (politesse), mets needsSources=false et sources=[].",
    "",
    "Sources disponibles :",
    sourceCatalog(input.sources, allowed),
    "",
    'Format : {"intent":"inform|collect|clarify","confidence":0..1,"needsSources":true|false,"sources":[{"source":"fiches|connaissances|medias","query":"...","limit":1..20}]}',
  ].join("\n");
  let raw: string;
  try {
    raw = await input.ai.complete({
      system,
      messages: [
        {
          role: "user",
          content: [
            `Mission : ${input.mission}`,
            `Collecte active : ${input.collectionActive ? "oui" : "non"}`,
            `Historique :\n${history || "(vide)"}`,
            `Message : ${input.message}`,
          ].join("\n\n"),
        },
      ],
      maxTokens: 350,
      structured: true,
    });
  } catch {
    return fallbackAnalysis(input, allowed);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallbackAnalysis(input, allowed);
  }
  if (!isRecord(parsed)) return fallbackAnalysis(input, allowed);
  const intent =
    parsed.intent === "inform" || parsed.intent === "collect" || parsed.intent === "clarify"
      ? parsed.intent
      : "clarify";
  const safeIntent = allowedIntents.includes(intent) ? intent : "clarify";
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
  const sources = parseSources(parsed.sources, allowed);
  const needsSources = parsed.needsSources === true;
  if (safeIntent === "collect") {
    return { intent: "collect", confidence, needsSources: false, sources: [], fallback: false };
  }
  if (safeIntent === "clarify") {
    return { intent: "clarify", confidence, needsSources, sources, fallback: false };
  }
  if (needsSources && sources.length === 0) {
    return { intent: "clarify", confidence, needsSources, sources, fallback: false };
  }
  return {
    intent: "inform",
    confidence,
    needsSources,
    sources: needsSources ? sources : [],
    fallback: false,
  };
}

function fallbackAnalysis(
  input: { message: string; allowedSources: InformationSourceKey[] },
  allowed: InformationSourceKey[],
): IntentAnalysis {
  const sources = allowed.map((source) => ({ source, query: input.message }));
  return {
    intent: sources.length > 0 ? "inform" : "clarify",
    confidence: 0,
    needsSources: sources.length > 0,
    sources,
    fallback: true,
  };
}
