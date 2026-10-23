import type {
  AiCatalogTarget,
  AiConnectionTestResult,
  AiModelCatalog,
  AiModelCatalogResult,
} from "@/application/ports/ai-model-catalog";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; models: string[] }>();

type ModelsResponse = {
  data?: Array<{ id?: unknown }>;
};

function urlFor(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403) return "Clé API refusée";
  if (status === 404 || status === 405) return "Catalogue /models indisponible";
  if (status === 429) return "Quota ou débit fournisseur dépassé";
  if (status >= 500) return "Fournisseur indisponible";
  return `Erreur fournisseur (HTTP ${status})`;
}

function parseModels(json: unknown): string[] {
  if (json === null || typeof json !== "object") return [];
  const data = (json as ModelsResponse).data;
  if (!Array.isArray(data)) return [];
  return [
    ...new Set(
      data
        .map((entry) => entry?.id)
        .filter((id): id is string => typeof id === "string" && id.trim() !== "")
        .map((id) => id.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

async function fetchModels(target: AiCatalogTarget): Promise<AiModelCatalogResult> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(urlFor(target.baseUrl, "/models"), {
      headers: { Authorization: `Bearer ${target.apiKey}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Délai d'attente du fournisseur dépassé");
    }
    throw new Error("Fournisseur IA injoignable");
  }

  if (!response.ok) {
    throw new Error(statusMessage(response.status));
  }

  const json: unknown = await response.json();
  const models = parseModels(json);
  return { models, modelsAvailable: true, latencyMs: Date.now() - startedAt };
}

/** Catalogue OpenAI `/models` avec cache mémoire court (jamais la clé en cache). */
export const openAiModelCatalog: AiModelCatalog = {
  async listModels(target) {
    const key = target.cacheKey;
    if (key !== undefined) {
      const hit = cache.get(key);
      if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) {
        return { models: hit.models, modelsAvailable: true, latencyMs: 0 };
      }
    }
    const result = await fetchModels(target);
    if (key !== undefined) cache.set(key, { at: Date.now(), models: result.models });
    return result;
  },

  async testConnection(target): Promise<AiConnectionTestResult> {
    try {
      const result = await fetchModels(target);
      return {
        ok: true,
        latencyMs: result.latencyMs,
        modelsCount: result.models.length,
        modelsAvailable: true,
        error: "",
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: 0,
        modelsCount: 0,
        modelsAvailable: false,
        error: error instanceof Error ? error.message : "Test fournisseur impossible",
      };
    }
  },
};
