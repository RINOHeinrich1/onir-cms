import { describe, expect, it } from "vitest";
import type { LinkTemplateDependencies } from "@/application/use-cases/visual-templates/link-template";
import {
  loadTemplateSpec,
  toContractMessages,
} from "@/application/use-cases/visual-templates/link-template";
import type { ChatLink, ChatMessage } from "@/domain/entities/chat";

const LINK = {
  visualTemplateId: "template-1",
  visualTemplateVersion: "1.0.0",
} as ChatLink;

function deps(params: unknown): LinkTemplateDependencies {
  return {
    visualTemplates: {
      findById: async () => ({ id: "template-1" }),
      findVersion: async () => ({
        version: "1.0.0",
        mode: "web-component",
        entry: "index.js",
        manifest: {
          ui: { element: "onirtech-template-legacy" },
          capabilities: ["messages"],
          params,
        },
      }),
    },
    medias: {},
    templates: {},
  } as unknown as LinkTemplateDependencies;
}

describe("loadTemplateSpec (manifestes legacy)", () => {
  it("normalise un manifeste sans params en tableau vide", async () => {
    const spec = await loadTemplateSpec(deps(undefined), LINK);
    expect(spec?.params).toEqual([]);
  });
});

describe("toContractMessages — messages opérateur", () => {
  it("expose un opérateur comme assistant signé Conseiller", () => {
    const message: ChatMessage = {
      id: "m1",
      conversationId: "c1",
      role: "operator",
      content: "Je prends le relais.",
      medias: [],
      mediasComputed: false,
      attachments: [],
      authorUserId: "u1",
      authorName: "Jean",
      createdAt: new Date(0).toISOString(),
    };
    const [contract] = toContractMessages([message], "org-1");
    expect(contract?.role).toBe("assistant");
    expect(contract?.authorName).toBe("Conseiller");
    expect(contract?.content).toBe("Je prends le relais.");
  });
});
