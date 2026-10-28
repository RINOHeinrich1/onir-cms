import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type {
  ActivityConversationRecord,
  ActivityLeadRecord,
  ActivityRepository,
} from "@/application/ports/activity-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationIncidentRepository } from "@/application/ports/conversation-incident-repository";
import {
  listActivityNotifications,
  markActivityNotificationsRead,
} from "@/application/use-cases/notifications/list-activity-notifications";

const ADMIN: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const OPERATEUR: Actor = {
  id: "op-1",
  role: "operateur",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const LECTEUR: Actor = {
  id: "lect-1",
  role: "lecteur",
  organizationId: "org-1",
  isSuperAdmin: false,
};

function baseDeps() {
  const listLatestConversations = vi.fn(
    async (): Promise<ActivityConversationRecord[]> => [
      {
        id: "c1",
        createdAt: "2026-10-28T08:59:00.000Z",
        visitorNom: "Jean",
        visitorEmail: "jean@example.com",
        linkLabel: "Campagne",
      },
    ],
  );
  const listLatestLeads = vi.fn(
    async (): Promise<ActivityLeadRecord[]> => [
      {
        id: "f1",
        createdAt: "2026-10-28T09:01:00.000Z",
        templateKey: "fiche-projet",
        data: { entreprise: "ACME" },
        prospectNom: "Alice",
        prospectPrenom: "Martin",
      },
    ],
  );
  const ensureLastReadAt = vi.fn(async () => "2026-10-28T09:00:00.000Z");
  const markRead = vi.fn(async () => "2026-10-28T10:00:00.000Z");
  const countConversationsSince = vi.fn(async () => 1);
  const countLeadsSince = vi.fn(async () => 2);
  const activity = {
    ensureLastReadAt,
    markRead,
    listLatestConversations,
    listLatestLeads,
    countConversationsSince,
    countLeadsSince,
  };
  const findForUser = vi.fn(async () => ({ allLinks: false, linkIds: ["link-1"] }));
  const operatorScopes = { findForUser } as unknown as ChatOperatorScopeRepository;
  const listOpen = vi.fn(async () => [
    {
      id: "i1",
      organizationId: "org-1",
      conversationId: "c1",
      kind: "ai_reply_failed" as const,
      severity: "high" as const,
      title: "Réponse IA impossible",
      detail: "Jean — service indisponible",
      status: "open" as const,
      occurrences: 2,
      firstSeenAt: "2026-10-28T09:02:00.000Z",
      lastSeenAt: "2026-10-28T09:03:00.000Z",
      resolvedAt: null,
      resolvedBy: null,
      visitorNom: "Jean",
      visitorEmail: "jean@example.com",
      linkLabel: "Campagne",
    },
  ]);
  const countOpen = vi.fn(async () => 1);
  const incidents = { listOpen, countOpen } as unknown as ConversationIncidentRepository;
  return {
    activity: activity as unknown as ActivityRepository,
    operatorScopes,
    incidents,
    listOpen,
    countOpen,
    listLatestConversations,
    listLatestLeads,
    ensureLastReadAt,
    markRead,
    countConversationsSince,
    countLeadsSince,
  };
}

describe("listActivityNotifications", () => {
  it("retourne les activités récentes, le compteur non lu et le filigrane", async () => {
    const base = baseDeps();
    const feed = await listActivityNotifications(base, ADMIN, 6);
    expect(feed.items.map((item) => item.id)).toEqual(["lead:f1", "conversation:c1"]);
    expect(feed.items.map((item) => item.read)).toEqual([false, true]);
    expect(feed.alerts.map((item) => item.id)).toEqual(["i1"]);
    expect(feed.alertCount).toBe(1);
    expect(feed.unreadCount).toBe(3);
    expect(feed.hasMore).toBe(false);
    expect(feed.lastReadAt).toBe("2026-10-28T09:00:00.000Z");
    expect(base.listLatestConversations).toHaveBeenCalledWith("org-1", null, 7);
    expect(base.listLatestLeads).toHaveBeenCalledWith("org-1", 7);
    expect(base.countConversationsSince).toHaveBeenCalledWith(
      "org-1",
      "2026-10-28T09:00:00.000Z",
      null,
    );
  });

  it("un opérateur ne reçoit que ses conversations, dans son périmètre", async () => {
    const base = baseDeps();
    const feed = await listActivityNotifications(base, OPERATEUR, 6);
    expect(feed.items.map((item) => item.kind)).toEqual(["conversation"]);
    expect(feed.alerts).toHaveLength(1);
    expect(base.listLatestLeads).not.toHaveBeenCalled();
    expect(base.listOpen).toHaveBeenCalledWith("org-1", ["link-1"]);
    expect(base.countLeadsSince).not.toHaveBeenCalled();
    expect(base.listLatestConversations).toHaveBeenCalledWith("org-1", ["link-1"], 7);
  });

  it("un lecteur reçoit les deux types", async () => {
    const base = baseDeps();
    const feed = await listActivityNotifications(base, LECTEUR, 6);
    expect(feed.items.map((item) => item.kind)).toEqual(["lead", "conversation"]);
    expect(feed.alertCount).toBe(0);
    expect(base.listOpen).not.toHaveBeenCalled();
  });

  it("signale hasMore avec la marge limit + 1", async () => {
    const base = baseDeps();
    const many = Array.from({ length: 7 }, (_, index) => ({
      id: `f${index}`,
      createdAt: `2026-10-28T09:0${index}:00.000Z`,
      templateKey: "fiche-projet",
      data: {},
      prospectNom: null,
      prospectPrenom: null,
    }));
    base.listLatestLeads.mockResolvedValue(many);
    const feed = await listActivityNotifications(base, ADMIN, 6);
    expect(feed.items).toHaveLength(6);
    expect(feed.hasMore).toBe(true);
  });

  it("borne la limite demandée à 50", async () => {
    const base = baseDeps();
    await listActivityNotifications(base, ADMIN, 999);
    expect(base.listLatestConversations).toHaveBeenCalledWith("org-1", null, 51);
    expect(base.listLatestLeads).toHaveBeenCalledWith("org-1", 51);
  });
});

describe("markActivityNotificationsRead", () => {
  it("avance le filigrane au présent", async () => {
    const base = baseDeps();
    const result = await markActivityNotificationsRead(base, ADMIN);
    expect(result.lastReadAt).toBe("2026-10-28T10:00:00.000Z");
    expect(base.markRead).toHaveBeenCalledWith("org-1", "admin-1");
  });
});
