import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import { copyChatLink } from "@/application/use-cases/links/manage-chat-links";
import type { ChatLink } from "@/domain/entities/chat";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function linkRow(overrides: Partial<ChatLink> = {}): ChatLink {
  return {
    id: "link-1",
    organizationId: "org-1",
    label: "",
    type: "standard",
    surface: "page",
    identificationMode: "contact",
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
    widgetConfig: {},
    aiProviderId: null,
    aiModel: null,
    visitCount: 0,
    lastVisitAt: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("LINK_TOKEN_KEY", "c".repeat(64));
});

describe("copyChatLink — URL stable", () => {
  it("re-déchiffre sans régénérer quand le chiffré existe", async () => {
    const { encryptLinkToken } = await import("@/lib/link-crypto");
    const stored = encryptLinkToken("token-stable");
    const links: ChatLinkRepository = {
      findById: async () => linkRow(),
      findByTokenHash: async () => null,
      list: async () => [],
      create: async () => linkRow(),
      recordVisit: async () => undefined,
      getTokenEnc: async () => stored,
      setLinkToken: async () => {
        throw new Error("ne devrait pas régénérer");
      },
      updateDetails: async () => null,
      delete: async () => false,
    };
    const first = await copyChatLink({ links }, ACTOR, "link-1");
    const second = await copyChatLink({ links }, ACTOR, "link-1");
    expect(first.token).toBe("token-stable");
    expect(second.token).toBe("token-stable");
    expect(first.url).toBe(second.url);
    expect(first.rotated).toBe(false);
  });

  it("régénère une fois pour une ligne legacy sans chiffré", async () => {
    const setLinkToken = vi.fn(
      async (
        _organizationId: string,
        _id: string,
        _input: { tokenHash: string; tokenEnc: string },
      ) => linkRow(),
    );
    const links: ChatLinkRepository = {
      findById: async () => linkRow(),
      findByTokenHash: async () => null,
      list: async () => [],
      create: async () => linkRow(),
      recordVisit: async () => undefined,
      getTokenEnc: async () => null,
      setLinkToken,
      updateDetails: async () => null,
      delete: async () => false,
    };
    const copied = await copyChatLink({ links }, ACTOR, "link-1");
    expect(copied.token).toHaveLength(32);
    expect(copied.rotated).toBe(true);
    expect(setLinkToken).toHaveBeenCalledOnce();
  });

  it("échoue proprement sur lien introuvable", async () => {
    const links: ChatLinkRepository = {
      findById: async () => null,
      findByTokenHash: async () => null,
      list: async () => [],
      create: async () => linkRow(),
      recordVisit: async () => undefined,
      getTokenEnc: async () => null,
      setLinkToken: async () => null,
      updateDetails: async () => null,
      delete: async () => false,
    };
    await expect(copyChatLink({ links }, ACTOR, "missing")).rejects.toThrow(/introuvable/);
  });
});
