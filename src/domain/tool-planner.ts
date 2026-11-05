/**
 * Planner JSON de secours (ADR-0067 §7.2).
 *
 * Utilisé quand le fournisseur n'annonce pas le tool calling natif. Le modèle
 * répond un objet JSON strict :
 *
 *   { "action": "search_fiches", "arguments": { ... } }
 *   { "action": "final", "text": "..." }
 *
 * La validation est volontairement stricte : une sortie invalide n'exécute
 * **jamais** d'outil. L'appelant retente une fois puis répond sans outil.
 */

export const PLANNER_TOOL_ACTIONS = [
  "search_fiches",
  "continue_search",
  "get_fiche",
  "list_fiche_types",
  "count_fiches",
] as const;

export type PlannerToolAction = (typeof PLANNER_TOOL_ACTIONS)[number];

export type PlannerResult =
  | { action: "final"; text: string }
  | { action: PlannerToolAction; arguments: Record<string, unknown> };

export function isPlannerToolAction(value: unknown): value is PlannerToolAction {
  return typeof value === "string" && (PLANNER_TOOL_ACTIONS as readonly string[]).includes(value);
}

/** Consigne ajoutée au prompt système quand le planner est actif. */
export const PLANNER_SYSTEM_SUFFIX = [
  "Tu peux utiliser des outils de recherche internes en lecture seule.",
  "Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec l'une des formes :",
  '{"action":"search_fiches","arguments":{...}}',
  '{"action":"continue_search","arguments":{"limit":10}}',
  '{"action":"get_fiche","arguments":{"ficheId":"..."}}',
  '{"action":"list_fiche_types","arguments":{}}',
  '{"action":"count_fiches","arguments":{...}}',
  '{"action":"final","text":"..."}',
  "N'invente jamais de valeur : si aucune recherche n'est nécessaire, utilise final.",
  "Maximum deux appels d'outil par message.",
].join("\n");

/** Rappel ajouté au second essai quand la première sortie est invalide. */
export const PLANNER_RETRY_SUFFIX = [
  "La réponse précédente n'était pas un JSON valide conforme.",
  "Réponds à nouveau UNIQUEMENT par un objet JSON valide, sans balise ni commentaire.",
].join("\n");

/** Vue minimale d'un outil : le domaine ne dépend pas du port applicatif. */
export type PlannerToolSummary = { name: string; description: string };

/** Catalogue texte des outils réellement disponibles (jamais les statuts). */
export function buildPlannerToolCatalog(tools: readonly PlannerToolSummary[]): string {
  if (tools.length === 0) return "";
  const lines = ["Outils disponibles :"];
  for (const tool of tools) {
    lines.push(`- ${tool.name} : ${tool.description}`);
  }
  return lines.join("\n");
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced === null ? trimmed : (fenced[1] ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Parse et valide une sortie planner. `null` si elle est inutilisable. */
export function parsePlannerOutput(raw: string): PlannerResult | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }
  if (!isRecord(decoded)) return null;

  const action = decoded.action;
  if (action === "final") {
    const text = decoded.text;
    if (typeof text !== "string" || text.trim() === "") return null;
    return { action: "final", text: text.trim() };
  }
  if (!isPlannerToolAction(action)) return null;

  const args = decoded.arguments;
  if (args === undefined || args === null) return { action, arguments: {} };
  if (!isRecord(args)) return null;
  return { action, arguments: { ...args } };
}
