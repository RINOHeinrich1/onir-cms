import type { ChatLinkDto } from "@/components/links/types";

/** Option minimale d'un chatbot pour les sélecteurs de portée. */
export type ChatLinkOption = { id: string; label: string };

/** Nom lisible d'un chatbot : libellé, sinon mention neutre (jamais la clé). */
export function chatLinkDisplayName(link: Pick<ChatLinkDto, "id" | "label">): string {
  const label = link.label.trim();
  return label === "" ? "Chatbot sans nom" : label;
}

/** Portée lisible : « Global » ou les noms des chatbots sélectionnés. */
export function chatLinkScopeLabel(
  ids: readonly string[],
  options: readonly ChatLinkOption[],
): { global: boolean; labels: string[] } {
  if (ids.length === 0) return { global: true, labels: [] };
  const byId = new Map(options.map((option) => [option.id, option.label]));
  return {
    global: false,
    labels: ids.map((id) => byId.get(id) ?? "Chatbot indisponible"),
  };
}

let cache: Promise<ChatLinkOption[]> | null = null;

/**
 * Charge (une fois par session) les chatbots de l'organisation.
 * En cas d'échec le cache est vidé pour permettre un nouvel essai.
 */
export function loadChatLinkOptions(): Promise<ChatLinkOption[]> {
  if (cache === null) {
    cache = fetch("/api/links", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement des chatbots impossible");
        const json = (await response.json()) as { links?: ChatLinkDto[] };
        return (json.links ?? []).map((link) => ({
          id: link.id,
          label: chatLinkDisplayName(link),
        }));
      })
      .catch((error: unknown) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}
