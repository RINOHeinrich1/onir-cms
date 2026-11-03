import { ValidationError } from "@/application/errors";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { ChatLink } from "@/domain/entities/chat";
import { type ChatbotConfig, defaultChatbotDataSelection } from "@/domain/entities/chatbot-config";
import type { Connaissance } from "@/domain/entities/connaissance";
import type { Media, TypeMedia } from "@/domain/entities/media";

type LinkScope = Pick<ChatLink, "id">;

function selectedIncludes<T extends { id: string; chatLinkIds: string[] }>(
  items: T[],
  chatLinkId: string,
  globalIds: string[],
): T[] {
  const selected = new Set(globalIds);
  return items.filter(
    (item) =>
      item.chatLinkIds.includes(chatLinkId) ||
      (item.chatLinkIds.length === 0 && selected.has(item.id)),
  );
}

function requireSelection(config: ChatbotConfig | null) {
  if (config === null) {
    throw new ValidationError("Configuration chatbot requise");
  }
  return config.dataSelection ?? defaultChatbotDataSelection();
}

/**
 * Connaissances actives utilisables par le runtime d'un chatbot.
 * - `all` : globales + connaissances déjà scopées à ce chatbot.
 * - `selected` : globales explicitement sélectionnées + connaissances scopées.
 * Le runtime exige une configuration : les liens sans configuration sont refusés.
 */
export async function listRuntimeConnaissances(
  deps: { connaissances: ConnaissanceRepository },
  organizationId: string,
  link: LinkScope,
  config: ChatbotConfig | null,
): Promise<Connaissance[]> {
  const selection = requireSelection(config);
  if (selection.mode === "all") {
    return (await deps.connaissances.listActivesForChatLink?.(organizationId, link.id)) ?? [];
  }
  if (selection.mode === "selected") {
    if (deps.connaissances.listActivesForChatLinkSelection !== undefined) {
      return deps.connaissances.listActivesForChatLinkSelection(
        organizationId,
        link.id,
        selection.connaissanceIds,
      );
    }
    const all = (await deps.connaissances.listActivesForChatLink?.(organizationId, link.id)) ?? [];
    return selectedIncludes(all, link.id, selection.connaissanceIds);
  }
  return [];
}

/**
 * Médias actifs utilisables par le runtime d'un chatbot.
 * Même contrat de sélection que les connaissances, par nature de média.
 */
export async function listRuntimeMedias(
  deps: { medias: MediaRepository },
  organizationId: string,
  link: LinkScope,
  type: TypeMedia,
  config: ChatbotConfig | null,
): Promise<Media[]> {
  const selection = requireSelection(config);
  if (selection.mode === "all") {
    return (await deps.medias.listActivesByTypeForChatLink?.(organizationId, type, link.id)) ?? [];
  }
  if (selection.mode === "selected") {
    if (deps.medias.listActivesByTypeForChatLinkSelection !== undefined) {
      return deps.medias.listActivesByTypeForChatLinkSelection(
        organizationId,
        type,
        link.id,
        selection.mediaIds,
      );
    }
    const all =
      (await deps.medias.listActivesByTypeForChatLink?.(organizationId, type, link.id)) ?? [];
    return selectedIncludes(all, link.id, selection.mediaIds);
  }
  return [];
}
