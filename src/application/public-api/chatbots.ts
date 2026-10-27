import { NotFoundError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import { chatbotDto } from "@/application/public-api/dto";
import type { ApiCursor, ApiSort } from "@/application/public-api/pagination";
import { paginateByCreatedAt } from "@/application/public-api/pagination";
import {
  type CreateChatLinkDependencies,
  createChatLinkForOrganization,
} from "@/application/use-cases/links/create-chat-link";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import {
  deleteChatLinkForOrganization,
  type ManageChatLinksDependencies,
  updateChatLinkForOrganization,
} from "@/application/use-cases/links/manage-chat-links";
import type { ChatLink } from "@/domain/entities/chat";
import { appUrl } from "@/lib/env";

export type ChatbotListCriteria = {
  q: string | null;
  type: "specifique" | "standard" | null;
  active: boolean | null;
  limit: number;
  cursor: ApiCursor | null;
  sort: ApiSort;
};

function matches(link: ChatLink, criteria: ChatbotListCriteria): boolean {
  if (criteria.type !== null && link.type !== criteria.type) return false;
  if (criteria.active !== null && link.actif !== criteria.active) return false;
  if (criteria.q !== null) {
    const needle = criteria.q.toLowerCase();
    if (!`${link.label} ${link.templateKey}`.toLowerCase().includes(needle)) return false;
  }
  return true;
}

export async function listChatbotsForApi(
  deps: { links: ChatLinkRepository },
  organizationId: string,
  criteria: ChatbotListCriteria,
) {
  const links = await deps.links.list(organizationId);
  const withUrls = await linkListItems(deps.links, links);
  const filtered = withUrls.filter((link) => matches(link, criteria));
  const page = paginateByCreatedAt(filtered, criteria.limit, criteria.cursor, criteria.sort);
  return {
    data: page.data.map(chatbotDto),
    pagination: page.pagination,
  };
}

export async function getChatbotForApi(
  deps: { links: ChatLinkRepository },
  organizationId: string,
  id: string,
) {
  const link = await deps.links.findById(organizationId, id);
  if (link === null) throw new NotFoundError("Chatbot introuvable");
  const [withUrl] = await linkListItems(deps.links, [link]);
  if (withUrl === undefined) throw new NotFoundError("Chatbot introuvable");
  return chatbotDto(withUrl);
}

export async function createChatbotForApi(
  deps: CreateChatLinkDependencies,
  organizationId: string,
  createdBy: string | null,
  input: unknown,
) {
  const { link, token } = await createChatLinkForOrganization(
    deps,
    organizationId,
    createdBy,
    input,
  );
  return chatbotDto({ ...link, url: `${appUrl()}/l/${token}` });
}

export async function updateChatbotForApi(
  deps: ManageChatLinksDependencies,
  organizationId: string,
  id: string,
  input: unknown,
) {
  const link = await updateChatLinkForOrganization(deps, organizationId, id, input);
  const [withUrl] = await linkListItems(deps.links, [link]);
  if (withUrl === undefined) throw new NotFoundError("Chatbot introuvable");
  return chatbotDto(withUrl);
}

export async function deleteChatbotForApi(
  deps: { links: ChatLinkRepository },
  organizationId: string,
  id: string,
): Promise<void> {
  await deleteChatLinkForOrganization(deps, organizationId, id);
}
