import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ChatLink } from "@/domain/entities/chat";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";

export type ConflictedChatbot = {
  id: string;
  label: string;
};

export type ConnaissanceConflict = {
  titre: string;
  existingId: string;
  existingTitre: string;
  existingContenuPreview: string;
  existingChatLinkIds: string[];
  affectedChatbots: ConflictedChatbot[];
};

export type ResolveConnaissanceConflictsDependencies = {
  connaissances: ConnaissanceRepository;
  links: ChatLinkRepository;
  configs: ChatbotConfigRepository;
};

function normalizedTitle(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("fr") : "";
}

function inputItems(value: unknown): Array<{ titre: string }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: Array<{ titre: string }> = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const titre = typeof raw.titre === "string" ? raw.titre.trim() : "";
    const key = normalizedTitle(titre);
    if (titre === "" || seen.has(key)) continue;
    seen.add(key);
    items.push({ titre });
    if (items.length >= 10) break;
  }
  return items;
}

function consumes(
  link: ChatLink,
  config: ChatbotConfig | null,
  knowledge: { id: string; chatLinkIds: string[] },
): boolean {
  if (knowledge.chatLinkIds.length > 0 && !knowledge.chatLinkIds.includes(link.id)) {
    return false;
  }
  const source = config?.informationSources?.connaissances;
  if (source !== undefined) {
    if (!source.enabled) return false;
    if (knowledge.chatLinkIds.length > 0) return true;
    return source.selection.mode === "all" || source.selection.ids.includes(knowledge.id);
  }
  if (!link.sources.connaissances) return false;
  if (knowledge.chatLinkIds.length > 0) return true;
  return (
    config?.dataSelection.mode === "all" ||
    (config?.dataSelection.connaissanceIds.includes(knowledge.id) ?? false)
  );
}

export async function resolveConnaissanceConflicts(
  deps: ResolveConnaissanceConflictsDependencies,
  actor: Actor,
  input: unknown,
): Promise<ConnaissanceConflict[]> {
  assertCan(actor, "links:create");
  const organizationId = organizationOf(actor);
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const items = inputItems(source.items);
  if (items.length === 0) return [];

  const existing = await Promise.all(
    items.map((item) => deps.connaissances.findByTitre(organizationId, item.titre)),
  );
  const conflicts = existing.filter((item) => item !== null);
  if (conflicts.length === 0) return [];

  const links = await deps.links.list(organizationId);
  const configs = await Promise.all(
    links.map((link) => deps.configs.currentForLink(organizationId, link.id)),
  );

  return conflicts.map((item) => {
    const affectedChatbots = links
      .map((link, index) => ({ link, config: configs[index] ?? null }))
      .filter(({ link, config }) => consumes(link, config, item))
      .map(({ link }) => ({
        id: link.id,
        label: link.label.trim() === "" ? "Chatbot sans nom" : link.label.trim(),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "fr"));

    return {
      titre: item.titre,
      existingId: item.id,
      existingTitre: item.titre,
      existingContenuPreview: item.contenu.slice(0, 180),
      existingChatLinkIds: [...item.chatLinkIds],
      affectedChatbots,
    };
  });
}
