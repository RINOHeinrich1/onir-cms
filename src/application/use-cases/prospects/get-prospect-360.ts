import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type { Conversation } from "@/domain/entities/chat";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";

export type Prospect360Dependencies = {
  prospects: ProspectRepository;
  fiches: FicheRepository;
  links: ChatLinkRepository;
  conversations: ConversationRepository;
};

/** Contact consolidé du client, avec sa provenance. */
export type Prospect360Contact = {
  type: string;
  valeur: string;
  source: "prospect" | "conversation";
};

export type Prospect360Conversation = {
  id: string;
  createdAt: string;
  nom: string;
  email: string;
  contacts: { type: string; valeur: string }[];
};

/** Vue « 360 » d'un client : identité, contacts, conversations, fiches. */
export type Prospect360 = {
  prospect: Prospect;
  contacts: Prospect360Contact[];
  conversations: Prospect360Conversation[];
  fiches: Fiche[];
};

/**
 * Fiche 360 d'un prospect : rassemble son identité, **tous ses contacts**
 * (identité + moyens collectés en conversation), ses conversations et ses
 * fiches de prospection. Les conversations sont retrouvées par deux chemins : les
 * liens spécifiques du prospect, et les fiches qui portent une conversation.
 */
export async function getProspect360(
  deps: Prospect360Dependencies,
  actor: Actor,
  prospectId: string,
): Promise<Prospect360> {
  assertCan(actor, "prospects:read");

  const organizationId = organizationOf(actor);
  const prospect = await deps.prospects.findById(organizationId, prospectId);
  if (prospect === null) {
    throw new NotFoundError("Prospect introuvable");
  }

  const fiches = (await deps.fiches.list(organizationId, "toutes")).filter(
    (fiche) => fiche.prospectId === prospect.id,
  );

  const prospectLinks = (await deps.links.list(organizationId)).filter(
    (link) => link.prospectId === prospect.id,
  );
  const byLink = await Promise.all(
    prospectLinks.map((link) => deps.conversations.listByLink(organizationId, link.id)),
  );
  const byFiche = await Promise.all(
    fiches
      .map((fiche) => fiche.conversationId)
      .filter((id): id is string => id !== null)
      .map((id) => deps.conversations.findById(organizationId, id)),
  );

  const conversations: Conversation[] = [];
  const seen = new Set<string>();
  for (const conversation of [...byLink.flat(), ...byFiche]) {
    if (conversation === null || seen.has(conversation.id)) continue;
    seen.add(conversation.id);
    conversations.push(conversation);
  }
  conversations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Contacts consolidés : email du prospect + moyens collectés en conversation.
  const contacts: Prospect360Contact[] = [
    { type: "email", valeur: prospect.email, source: "prospect" },
  ];
  const seenContacts = new Set([`email:${prospect.email.trim().toLowerCase()}`]);
  for (const conversation of conversations) {
    for (const entry of conversation.visitorContacts) {
      const key = `${entry.type}:${entry.valeur.trim().toLowerCase()}`;
      if (seenContacts.has(key)) continue;
      seenContacts.add(key);
      contacts.push({ type: entry.type, valeur: entry.valeur, source: "conversation" });
    }
  }

  return {
    prospect,
    contacts,
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      createdAt: conversation.createdAt,
      nom: conversation.visitorNom,
      email: conversation.visitorEmail,
      contacts: conversation.visitorContacts,
    })),
    fiches,
  };
}
