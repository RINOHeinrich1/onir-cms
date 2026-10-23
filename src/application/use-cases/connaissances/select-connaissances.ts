import type { AiClient } from "@/application/ports/ai-client";
import type { Connaissance } from "@/domain/entities/connaissance";

/** Plafond d'entrées envoyées à la sélection (borne le coût/latence). */
export const MAX_ENTREES_SELECTION = 40;

export type SelectConnaissancesDependencies = {
  ai: AiClient;
};

/**
 * Mini-RAG sans indexation : le LLM choisit lui-même, parmi les titres
 * disponibles, ceux utiles à la question — puis on injecte leur contenu.
 * Échec silencieux (retour []) : le chat répond sans contexte plutôt que
 * de casser. Seuls les titres connus sont retenus.
 */
export async function selectConnaissancesUtiles(
  deps: SelectConnaissancesDependencies,
  entrees: Connaissance[],
  question: string,
): Promise<Connaissance[]> {
  const candidates = entrees.slice(0, MAX_ENTREES_SELECTION);
  if (candidates.length === 0 || question.trim() === "") {
    return [];
  }

  const catalogue = candidates.map((entree) => `- ${entree.titre}`).join("\n");
  let raw: string;
  try {
    raw = await deps.ai.complete({
      system: [
        "Tu sélectionnes, parmi des informations internes, celles utiles pour répondre.",
        'Réponds UNIQUEMENT avec du JSON strict : {"titres": ["titre exact", ...]}.',
        "Liste vide [] si aucune information n'est utile. Aucun autre texte.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `Informations disponibles :\n${catalogue}\n\nQuestion du visiteur : ${question.trim()}`,
        },
      ],
      maxTokens: 150,
    });
  } catch {
    return [];
  }

  let titres: unknown;
  try {
    const parsed: unknown = JSON.parse(raw);
    titres =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).titres
        : [];
  } catch {
    return [];
  }
  if (!Array.isArray(titres)) return [];

  const wanted = new Set(
    titres
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase()),
  );
  return candidates.filter((entree) => wanted.has(entree.titre.trim().toLowerCase()));
}

/** Bloc « Contexte interne » injecté au prompt de réponse. */
export function buildContexteInterne(entrees: Connaissance[]): string {
  if (entrees.length === 0) return "";
  const blocs = entrees.map((entree) => `### ${entree.titre}\n${entree.contenu.trim()}`);
  return `Informations internes potentiellement utiles (à utiliser si pertinent, sans jamais les citer comme source) :\n${blocs.join("\n\n")}`;
}
