import { describe, expect, it } from "vitest";
import { formatLegacyMigrationPlan } from "@/infrastructure/db/plan-legacy-chatbot-migration";

describe("plan de migration legacy", () => {
  it("affiche les bloquants et l'absence d'écriture", () => {
    const report = formatLegacyMigrationPlan({
      generatedAt: "2026-10-29T00:00:00.000Z",
      link: {
        id: "l1",
        organizationId: "org-1",
        organization: "Onirtech",
        label: "Démo",
        type: "standard",
        actif: true,
        templateKey: "demo",
        templateVersion: 1,
        alreadyConfigured: false,
        openConversations: 1,
        conversations: 3,
        fiches: 2,
      },
      template: {
        label: "Démo",
        description: "",
        fieldCount: 2,
        linksUsingTemplate: 2,
        shareLinkIds: ["l1", "l2"],
      },
      proposedConfig: null,
      contentScope: {
        scopedConnaissances: 1,
        scopedMedias: 0,
        globalConnaissances: 1,
        globalMedias: 1,
        chatLinkIdsToAdd: ["l1", "l2"],
      },
      blockers: ["Template introuvable"],
      warnings: [],
    });
    expect(report).toContain("Template introuvable");
    expect(report).toContain("Aucune écriture");
  });
});
