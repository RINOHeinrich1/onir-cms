import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { ChatLink } from "@/domain/entities/chat";
import { type ChatbotConfig, defaultChatbotDataSelection } from "@/domain/entities/chatbot-config";
import type { Connaissance } from "@/domain/entities/connaissance";
import type { Media, TypeMedia } from "@/domain/entities/media";

type LinkScope = Pick<ChatLink, "id" | "templateKey">;

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

/**
 * Connaissances actives utilisables par le runtime d'un chatbot.
 * - config absente (legacy) : comportement historique par template.
 * - `all` : globales + connaissances déjà scopées à ce chatbot.
 * - `selected` : globales explicitement sélectionnées + connaissances scopées.
 */
export async function listRuntimeConnaissances(
  deps: { connaissances: ConnaissanceRepository },
  organizationId: string,
  link: LinkScope,
  config: ChatbotConfig | null,
): Promise<Connaissance[]> {
  if (config === null) {
    return deps.connaissances.listActives(organizationId, link.templateKey);
  }
  const selection = config.dataSelection ?? defaultChatbotDataSelection();
  if (selection.mode === "all") {
    if (deps.connaissances.listActivesForChatLink !== undefined) {
      return deps.connaissances.listActivesForChatLink(organizationId, link.id);
    }
    return deps.connaissances.listActives(organizationId, link.templateKey);
  }
  if (deps.connaissances.listActivesForChatLinkSelection !== undefined) {
    return deps.connaissances.listActivesForChatLinkSelection(
      organizationId,
      link.id,
      selection.connaissanceIds,
    );
  }
  const all =
    deps.connaissances.listActivesForChatLink !== undefined
      ? await deps.connaissances.listActivesForChatLink(organizationId, link.id)
      : await deps.connaissances.listActives(organizationId, link.templateKey);
  return selectedIncludes(all, link.id, selection.connaissanceIds);
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
  if (config === null) {
    return deps.medias.listActivesByType(organizationId, type, link.templateKey);
  }
  const selection = config.dataSelection ?? defaultChatbotDataSelection();
  if (selection.mode === "all") {
    if (deps.medias.listActivesByTypeForChatLink !== undefined) {
      return deps.medias.listActivesByTypeForChatLink(organizationId, type, link.id);
    }
    return deps.medias.listActivesByType(organizationId, type, link.templateKey);
  }
  if (deps.medias.listActivesByTypeForChatLinkSelection !== undefined) {
    return deps.medias.listActivesByTypeForChatLinkSelection(
      organizationId,
      type,
      link.id,
      selection.mediaIds,
    );
  }
  const all =
    deps.medias.listActivesByTypeForChatLink !== undefined
      ? await deps.medias.listActivesByTypeForChatLink(organizationId, type, link.id)
      : await deps.medias.listActivesByType(organizationId, type, link.templateKey);
  return selectedIncludes(all, link.id, selection.mediaIds);
}
