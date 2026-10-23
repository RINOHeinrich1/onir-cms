import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatLink } from "@/domain/entities/chat";
import { appUrl } from "@/lib/env";
import { decryptLinkToken } from "@/lib/link-crypto";

/** Ligne de lien avec son URL partageable (ou null). */
export type ChatLinkWithUrl = ChatLink & { url: string | null };

/** Ligne de lien exposée aux clients : URL + libellé du créateur. */
export type ChatLinkListItem = ChatLinkWithUrl & { createdByLabel: string | null };

/** URL partageable d'un chiffré (null si absent ou illisible). */
export function publicUrl(tokenEnc: string | null): string | null {
  if (tokenEnc === null) return null;
  try {
    return `${appUrl()}/l/${decryptLinkToken(tokenEnc)}`;
  } catch {
    return null;
  }
}

/**
 * Enrichit une liste de liens avec leur URL (déchiffrement serveur).
 * Les lignes legacy sans chiffré obtiennent `url: null` (régénérable).
 */
export async function linkListItems(
  links: ChatLinkRepository,
  items: ChatLink[],
): Promise<ChatLinkWithUrl[]> {
  return Promise.all(
    items.map(async (link) => ({
      ...link,
      url: publicUrl(await links.getTokenEnc(link.organizationId, link.id)),
    })),
  );
}
