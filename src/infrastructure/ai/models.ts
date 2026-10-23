/**
 * Résolution du modèle IA Infomaniak (B027) — RM-IA-001.
 * `AI_MODEL` surcharge le choix ; sinon, premier modèle renvoyé par
 * `GET /2/ai/{product_id}/openai/v1/models` (cache mémoire).
 */

import { aiConfig } from "@/lib/env";

export function infomaniakBaseUrl(productId: string): string {
  return `https://api.infomaniak.com/2/ai/${productId}/openai/v1`;
}

type ModelsResponse = {
  data?: Array<{ id?: string }>;
};

let cachedDefault: string | null = null;

/** Liste les modèles disponibles (utile au diagnostic, jamais exposé tel quel). */
export async function fetchModels(): Promise<string[]> {
  const config = aiConfig();
  const response = await fetch(`${infomaniakBaseUrl(config.productId)}/models`, {
    headers: { Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Liste des modèles IA impossible (HTTP ${response.status})`);
  }
  const json = (await response.json()) as ModelsResponse;
  const ids = (json.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string" && id !== "");
  return ids;
}

/** Modèle effectif : `AI_MODEL` si posé, sinon premier modèle du produit. */
export async function resolveModel(): Promise<string> {
  const config = aiConfig();
  if (config.model !== "") return config.model;
  if (cachedDefault !== null) return cachedDefault;
  const ids = await fetchModels();
  const first = ids[0];
  if (first === undefined) {
    throw new Error("Aucun modèle IA disponible sur ce produit");
  }
  cachedDefault = first;
  return first;
}
