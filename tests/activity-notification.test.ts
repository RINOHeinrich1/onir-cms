import { describe, expect, it } from "vitest";
import {
  conversationNotification,
  leadNotification,
  sortActivityNotifications,
} from "@/domain/activity-notification";

describe("conversationNotification", () => {
  it("construit le libellé visiteur + lien et la redirection", () => {
    const notification = conversationNotification({
      id: "c1",
      createdAt: "2026-10-28T10:00:00.000Z",
      visitorNom: "Jean Dupont",
      visitorEmail: "jean@example.com",
      linkLabel: "Campagne été",
    });
    expect(notification).toEqual({
      id: "conversation:c1",
      kind: "conversation",
      title: "Nouvelle conversation",
      detail: "Jean Dupont · Campagne été",
      href: "/conversations/c1",
      createdAt: "2026-10-28T10:00:00.000Z",
    });
  });

  it("retombe sur l'email puis « Visiteur anonyme »", () => {
    expect(
      conversationNotification({
        id: "c2",
        createdAt: "2026-10-28T10:00:00.000Z",
        visitorNom: "",
        visitorEmail: "visiteur@example.com",
        linkLabel: "",
      }).detail,
    ).toBe("visiteur@example.com");
    expect(
      conversationNotification({
        id: "c3",
        createdAt: "2026-10-28T10:00:00.000Z",
        visitorNom: "",
        visitorEmail: "",
        linkLabel: "",
      }).detail,
    ).toBe("Visiteur anonyme");
  });
});

describe("leadNotification", () => {
  it("privilégie le prospect et le premier champ métier", () => {
    const notification = leadNotification({
      id: "f1",
      createdAt: "2026-10-28T10:00:00.000Z",
      templateKey: "fiche-projet",
      data: { entreprise: "ACME", description: "Refonte du site" },
      prospectNom: "Alice",
      prospectPrenom: "Martin",
    });
    expect(notification.title).toBe("Nouveau lead");
    expect(notification.detail).toBe("Alice Martin · ACME");
    expect(notification.href).toBe("/leads/f1");
  });

  it("utilise le modèle quand aucune donnée lisible n'existe", () => {
    expect(
      leadNotification({
        id: "f2",
        createdAt: "2026-10-28T10:00:00.000Z",
        templateKey: "fiche-projet",
        data: {},
        prospectNom: null,
        prospectPrenom: null,
      }).detail,
    ).toBe("fiche-projet");
  });

  it("tronque les libellés trop longs", () => {
    const notification = leadNotification({
      id: "f3",
      createdAt: "2026-10-28T10:00:00.000Z",
      templateKey: "fiche-projet",
      data: { description: "x".repeat(300) },
      prospectNom: null,
      prospectPrenom: null,
    });
    expect(notification.detail.length).toBeLessThanOrEqual(140);
    expect(notification.detail.endsWith("…")).toBe(true);
  });
});

describe("sortActivityNotifications", () => {
  it("trie par date puis identifiant", () => {
    const items = sortActivityNotifications([
      conversationNotification({
        id: "b",
        createdAt: "2026-10-28T10:00:00.000Z",
        visitorNom: "B",
        visitorEmail: "",
        linkLabel: "",
      }),
      leadNotification({
        id: "a",
        createdAt: "2026-10-28T10:00:00.000Z",
        templateKey: "fiche-projet",
        data: {},
        prospectNom: null,
        prospectPrenom: null,
      }),
      conversationNotification({
        id: "c",
        createdAt: "2026-10-28T11:00:00.000Z",
        visitorNom: "C",
        visitorEmail: "",
        linkLabel: "",
      }),
    ]);
    expect(items.map((item) => item.id)).toEqual(["conversation:b", "lead:a", "conversation:c"]);
  });
});
