import type { AiClient } from "@/application/ports/ai-client";
import { type RecordAiUsage, withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import type { ChatMessage } from "@/domain/entities/chat";
import {
  broadFicheSearchPlan,
  type FicheSearchPlan,
  validateFicheSearchPlan,
} from "@/domain/fiche-search-plan";
import type { FicheSearchToolConfig } from "@/domain/fiche-search-tool";
import type {
  SearchableFicheDefinition,
  ValidatedFicheSearchRequest,
} from "@/domain/fiche-search-validation";

export type PlanFicheSearchResult = {
  request: ValidatedFicheSearchRequest | null;
  plan: FicheSearchPlan;
  fallback: boolean;
};

function fieldSchema(definition: SearchableFicheDefinition): string {
  const fields = definition.fields.slice(0, 20).map((field) => {
    const options =
      field.type === "select" || field.type === "multi"
        ? ` [options: ${(field.options ?? []).slice(0, 15).join(", ")}]`
        : "";
    return `  - ${field.name} (${field.label}) : ${field.type}${options}`;
  });
  return [`- ${definition.key} (${definition.label})`, ...fields].join("\n");
}

function schemaPrompt(
  definitions: readonly SearchableFicheDefinition[],
  config: FicheSearchToolConfig,
): string {
  const selected = definitions.filter((definition) => config.ficheTypes.includes(definition.key));
  return selected.map(fieldSchema).join("\n\n");
}

function historyPrompt(history: readonly ChatMessage[]): string {
  return history
    .slice(-10)
    .map((message) => `${message.role === "user" ? "Visiteur" : "Assistant"} : ${message.content}`)
    .join("\n");
}

function isConversationalQuery(value: string): boolean {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
  if (normalized === "") return false;
  if (/^(oui|non|ok|d'accord|yes|no|hello|bonjour|salut|merci)\b/u.test(normalized)) return true;
  return normalized.split(/\s+/u).length > 8;
}

/**
 * Une phrase conversationnelle ne doit jamais devenir une query. Le planner
 * est schema-aware : s'il n'a produit aucune condition, on élargit la
 * recherche au lieu de transmettre le message brut.
 */
function sanitizePlan(plan: FicheSearchPlan): { plan: FicheSearchPlan; fallback: boolean } {
  const conditions = plan.conditions ?? [];
  const rawQuery = (plan.query ?? "").trim();
  if (conditions.length === 0) {
    return { plan: { ...plan, query: "", conditions: [], limit: plan.limit ?? 5 }, fallback: true };
  }
  if (isConversationalQuery(rawQuery)) {
    return { plan: { ...plan, query: "" }, fallback: false };
  }
  return { plan, fallback: false };
}

/**
 * Planification de la source A — ADR-0068 §5.2.
 * Le message brut n'est jamais utilisé comme query de recherche.
 */
export async function planFicheSearch(input: {
  ai: AiClient;
  recordUsage: RecordAiUsage;
  message: string;
  history: readonly ChatMessage[];
  config: FicheSearchToolConfig;
  definitions: readonly SearchableFicheDefinition[];
}): Promise<PlanFicheSearchResult> {
  const fallback = (): PlanFicheSearchResult => {
    const plan = broadFicheSearchPlan();
    const validation = validateFicheSearchPlan(plan, input.definitions, input.config);
    return {
      request: validation.ok ? validation.value : null,
      plan,
      fallback: true,
    };
  };
  if (input.definitions.length === 0 || input.config.ficheTypes.length === 0) return fallback();

  const system = [
    "Tu prépares une recherche structurée dans des fiches métier.",
    "Tu ne réponds pas à l'utilisateur : tu produis uniquement un JSON strict.",
    "Tu reçois le schéma réel des fiches autorisées. N'invente jamais un champ.",
    "Tu peux utiliser une query libre et/ou des conditions sur les champs.",
    "Règles :",
    "- Un message de politesse, une confirmation (« Oui », « Ok ») ou un texte sans critère ne doit jamais devenir une query.",
    "- Si l'utilisateur demande une liste générale, renvoie une query vide et des conditions vides.",
    "- Si l'utilisateur donne une ville, une catégorie, un budget ou un service, utilise une condition de champ.",
    "- Pour un champ texte, utilise contains ; pour un select, eq ou in ; pour un multi, contains_any.",
    "- Les valeurs doivent être dans la langue/les options du champ.",
    "- Recoupe le message avec l'historique pour comprendre une réponse courte.",
    "- Ne choisis jamais une fiche hors du schéma fourni.",
    "- Si aucun critère fiable n'existe, renvoie une recherche large vide.",
    "",
    "Schéma des fiches :",
    schemaPrompt(input.definitions, input.config),
    "",
    'Format strict : {"query":"","conditions":[{"field":"...","operator":"contains","value":"..."}],"limit":5}',
  ].join("\n");
  let raw: string;
  try {
    raw = await withAiUsage(input.ai, input.recordUsage, "search_plan").complete({
      system,
      messages: [
        {
          role: "user",
          content: [
            `Historique :\n${historyPrompt(input.history) || "(vide)"}`,
            `Message courant : ${input.message}`,
          ].join("\n\n"),
        },
      ],
      maxTokens: 450,
      structured: true,
    });
  } catch {
    return fallback();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return fallback();
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) return fallback();
  const record = decoded as Record<string, unknown>;
  const decodedPlan: FicheSearchPlan = {
    ...(typeof record.query === "string" ? { query: record.query } : {}),
    ...(Array.isArray(record.conditions) ? { conditions: record.conditions as never } : {}),
    ...(typeof record.limit === "number" ? { limit: record.limit } : {}),
  };
  const { plan, fallback: broadened } = sanitizePlan(decodedPlan);
  const validation = validateFicheSearchPlan(plan, input.definitions, input.config);
  if (!validation.ok) return fallback();
  return { request: validation.value, plan, fallback: broadened };
}
