import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationIncidentRepository } from "@/application/ports/conversation-incident-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import {
  listConversationIncidents,
  recordConversationIncident,
  resolveConversationIncident,
} from "@/application/use-cases/conversations/conversation-incidents";

const ACTOR: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const INCIDENT = {
  id: "i1",
  organizationId: "org-1",
  conversationId: "c1",
  kind: "ai_reply_failed" as const,
  severity: "high" as const,
  title: "Réponse IA impossible",
  detail: "Jean — erreur",
  status: "open" as const,
  occurrences: 1,
  firstSeenAt: "2026-10-28T09:00:00.000Z",
  lastSeenAt: "2026-10-28T09:00:00.000Z",
  resolvedAt: null,
  resolvedBy: null,
  visitorNom: "Jean",
  visitorEmail: "jean@example.com",
  linkLabel: "Campagne",
};

function base() {
  const record = vi.fn(async () => undefined);
  const listForConversation = vi.fn(async () => [INCIDENT]);
  const resolve = vi.fn(async () => INCIDENT);
  const incidents = {
    record,
    listOpen: vi.fn(async () => [INCIDENT]),
    countOpen: vi.fn(async () => 1),
    listForConversation,
    resolve,
  };
  const conversations = {
    findByIdPublic: vi.fn(async () => ({
      id: "c1",
      organizationId: "org-1",
      linkId: "link-1",
      visitorNom: "Jean",
      visitorEmail: "jean@example.com",
    })),
    findById: vi.fn(async () => ({ id: "c1" })),
  };
  const links = { findById: vi.fn(async () => ({ id: "link-1", label: "Campagne" })) };
  return {
    deps: {
      conversations: conversations as unknown as ConversationRepository,
      links: links as unknown as ChatLinkRepository,
      incidents: incidents as unknown as ConversationIncidentRepository,
    },
    record,
    listForConversation,
    resolve,
  };
}

describe("conversation incidents", () => {
  it("enregistre une erreur avec le visiteur et le lien", async () => {
    const baseDeps = base();
    await recordConversationIncident(baseDeps.deps, {
      conversationId: "c1",
      kind: "ai_reply_failed",
      detail: "service indisponible",
    });
    expect(baseDeps.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        conversationId: "c1",
        kind: "ai_reply_failed",
        title: "Réponse IA impossible",
        detail: "Jean · Campagne — service indisponible",
      }),
    );
  });

  it("liste et résout un incident dans le périmètre", async () => {
    const baseDeps = base();
    const list = await listConversationIncidents(
      {
        conversations: baseDeps.deps.conversations,
        operatorScopes: {} as ChatOperatorScopeRepository,
        incidents: baseDeps.deps.incidents,
      },
      ACTOR,
      "c1",
    );
    expect(list).toHaveLength(1);
    const resolved = await resolveConversationIncident(
      {
        conversations: baseDeps.deps.conversations,
        operatorScopes: {} as ChatOperatorScopeRepository,
        incidents: baseDeps.deps.incidents,
      },
      ACTOR,
      "i1",
    );
    expect(resolved.id).toBe("i1");
    expect(baseDeps.resolve).toHaveBeenCalledWith("org-1", "i1", "admin-1", null);
  });
});
