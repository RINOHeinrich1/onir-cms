import { describe, expect, it } from "vitest";
import { formatLegacyChatbotAudit } from "@/infrastructure/db/audit-legacy-chatbots";

describe("audit des anciens chatbots", () => {
  it("affiche la synthèse et les liens bloquants", () => {
    const report = formatLegacyChatbotAudit({
      generatedAt: "2026-10-29T00:00:00.000Z",
      migration: "0063_conversation_summaries.sql",
      schema: {
        currentConfigId: true,
        chatLinkIds: true,
        chatbotConfigs: true,
        conversationSummaries: true,
      },
      summary: {
        totalLinks: 2,
        legacyLinks: 1,
        configuredLinks: 1,
        blockingLinks: 1,
        templates: 4,
        templateVersions: 5,
      },
      links: [
        {
          id: "l1",
          organization: "Onirtech",
          label: "Ancien lien | démo",
          type: "standard",
          actif: true,
          expiresAt: null,
          templateKey: "fiche-projet",
          templateVersion: 3,
          templateExists: true,
          versionExists: false,
          conversations: 12,
          openConversations: 1,
          fiches: 4,
          connaissancesVisibles: 7,
          mediasVisibles: 2,
          blocking: true,
        },
      ],
    });

    expect(report).toContain("Liens legacy : 1");
    expect(report).toContain("Liens legacy bloquants : 1");
    expect(report).toContain("Ancien lien \\| démo");
    expect(report).toContain("template « fiche-projet » v3 introuvable");
  });
});
