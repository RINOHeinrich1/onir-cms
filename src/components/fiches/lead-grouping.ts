import type { Fiche } from "@/domain/entities/fiche";

export type LeadChatbotOption = { id: string; label: string };

export type LeadChatbotGroup = {
  id: string;
  label: string;
  sansChatbot: boolean;
  total: number;
  active: number;
  archived: number;
  qualified: number;
  lastCreatedAt: string | null;
};

type GroupableFiche = Pick<
  Fiche,
  "chatLinkIds" | "archivee" | "qualificationStatusKey" | "createdAt"
>;

export const WITHOUT_CHATBOT_GROUP_ID = "sans-chatbot";

function emptyGroup(id: string, label: string, sansChatbot = false): LeadChatbotGroup {
  return {
    id,
    label,
    sansChatbot,
    total: 0,
    active: 0,
    archived: 0,
    qualified: 0,
    lastCreatedAt: null,
  };
}

/** Regroupe les fiches par chatbot, en conservant les chatbots sans fiche. */
export function groupFichesByChatbot(
  fiches: readonly GroupableFiche[],
  chatbots: readonly LeadChatbotOption[],
): LeadChatbotGroup[] {
  const groups = new Map<string, LeadChatbotGroup>();
  for (const chatbot of chatbots) {
    const label = chatbot.label.trim() === "" ? "Chatbot sans nom" : chatbot.label;
    groups.set(chatbot.id, emptyGroup(chatbot.id, label));
  }

  for (const fiche of fiches) {
    const linkIds = [...new Set(fiche.chatLinkIds ?? [])];
    if (linkIds.length === 0) {
      const group =
        groups.get(WITHOUT_CHATBOT_GROUP_ID) ??
        emptyGroup(WITHOUT_CHATBOT_GROUP_ID, "Sans chatbot", true);
      addFicheToGroup(group, fiche);
      groups.set(WITHOUT_CHATBOT_GROUP_ID, group);
      continue;
    }

    for (const linkId of linkIds) {
      const group = groups.get(linkId) ?? emptyGroup(linkId, "Chatbot");
      addFicheToGroup(group, fiche);
      groups.set(linkId, group);
    }
  }

  return [...groups.values()].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.label.localeCompare(right.label, "fr");
  });
}

function addFicheToGroup(group: LeadChatbotGroup, fiche: GroupableFiche): void {
  group.total += 1;
  if (fiche.archivee) group.archived += 1;
  else group.active += 1;
  if (
    fiche.qualificationStatusKey !== null &&
    fiche.qualificationStatusKey !== undefined &&
    fiche.qualificationStatusKey !== ""
  ) {
    group.qualified += 1;
  }
  if (group.lastCreatedAt === null || fiche.createdAt > group.lastCreatedAt) {
    group.lastCreatedAt = fiche.createdAt;
  }
}
