import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import { linkListItems, publicUrl } from "@/application/use-cases/links/link-urls";
import type { ChatLink } from "@/domain/entities/chat";
import { generateLinkToken } from "@/domain/link-token";
import { encryptLinkToken } from "@/lib/link-crypto";

const ACTOR_KEY = "e".repeat(64);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("LINK_TOKEN_KEY", ACTOR_KEY);
  vi.stubEnv("APP_URL", "https://cms.example.com");
});

function linkRow(id: string): ChatLink {
  return {
    id,
    organizationId: "org-1",
    label: "",
    type: "standard",
    prospectId: null,
    createdBy: "admin-1",
    actif: true,
    expiresAt: null,
    templateKey: "fiche-projet",
    templateVersion: 1,
    sources: { connaissances: true, phototheque: true, lien: true },
    confidentialiteId: null,
    userStateEnabled: false,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    aiProviderId: null,
    aiModel: null,
    createdAt: new Date(0).toISOString(),
  };
}

describe("publicUrl", () => {
  it("null sans chiffré (ligne legacy)", () => {
    expect(publicUrl(null)).toBeNull();
  });

  it("reconstruit l'URL partageable", () => {
    const token = generateLinkToken();
    expect(publicUrl(encryptLinkToken(token))).toBe(`https://cms.example.com/l/${token}`);
  });

  it("null sur chiffré illisible", () => {
    expect(publicUrl("corrompu")).toBeNull();
  });
});

describe("linkListItems", () => {
  it("enrichit chaque ligne de son URL (null si legacy)", async () => {
    const token = generateLinkToken();
    const { encryptLinkToken: enc } = await import("@/lib/link-crypto");
    const links: ChatLinkRepository = {
      findById: async () => null,
      findByTokenHash: async () => null,
      list: async () => [],
      create: async () => linkRow("x"),
      getTokenEnc: async (_organizationId, id) => (id === "l1" ? enc(token) : null),
      setLinkToken: async () => null,
      updateDetails: async () => null,
      delete: async () => false,
    };
    const items = await linkListItems(links, [linkRow("l1"), linkRow("l2")]);
    expect(items[0]?.url).toBe(`https://cms.example.com/l/${token}`);
    expect(items[1]?.url).toBeNull();
  });
});
