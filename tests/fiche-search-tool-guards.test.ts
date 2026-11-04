import { describe, expect, it } from "vitest";
import {
  type ChatLinkChannel,
  type ChatLinkChannels,
  isPublicChatLink,
} from "@/domain/entities/chat";
import {
  assertSearchToolConfigAllowedForLink,
  defaultSearchToolConfig,
  FicheSearchToolConfigError,
  searchToolConfigViolation,
} from "@/domain/fiche-search-tool-config";

function channels(
  pageMode: "contact" | "anonymous" | "internal",
  widgetMode: "contact" | "anonymous" | "internal" = "contact",
): ChatLinkChannels {
  const channel = (
    name: "page" | "widget",
    mode: "contact" | "anonymous" | "internal",
    enabled: boolean,
  ): ChatLinkChannel => ({
    channel: name,
    enabled,
    identificationMode: mode as ChatLinkChannel["identificationMode"],
    confidentialiteId: null,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    widgetConfig: {},
  });
  return {
    page: channel("page", pageMode, true),
    widget: channel("widget", widgetMode, false),
  };
}

describe("garde des modes backoffice sur lien public (ADR-0067 §2.5/§10)", () => {
  it("considère public tout canal activé non interne", () => {
    expect(isPublicChatLink(channels("contact"))).toBe(true);
    expect(isPublicChatLink(channels("anonymous"))).toBe(true);
    expect(isPublicChatLink(channels("internal"))).toBe(false);
    expect(isPublicChatLink(channels("contact", "internal"))).toBe(true);
  });

  it("autorise hidden_fixed + chat_link sur un lien public", () => {
    expect(searchToolConfigViolation(channels("contact"), defaultSearchToolConfig())).toBeNull();
    expect(() =>
      assertSearchToolConfigAllowedForLink(channels("contact"), defaultSearchToolConfig()),
    ).not.toThrow();
  });

  it("refuse internal_filter, all et scope=organization sur un lien public", () => {
    const base = defaultSearchToolConfig();
    expect(
      searchToolConfigViolation(channels("contact"), { ...base, statusMode: "internal_filter" }),
    ).toMatch(/backoffice/);
    expect(searchToolConfigViolation(channels("contact"), { ...base, statusMode: "all" })).toMatch(
      /backoffice/,
    );
    expect(
      searchToolConfigViolation(channels("contact"), { ...base, scope: "organization" }),
    ).toMatch(/organisation/);

    expect(() =>
      assertSearchToolConfigAllowedForLink(channels("contact"), {
        ...base,
        statusMode: "internal_filter",
      }),
    ).toThrow(FicheSearchToolConfigError);
  });

  it("autorise les modes backoffice sur un lien interne uniquement", () => {
    const base = defaultSearchToolConfig();
    expect(
      searchToolConfigViolation(channels("internal"), {
        ...base,
        statusMode: "all",
        scope: "organization",
      }),
    ).toBeNull();
  });
});

const MIN_CONFIG = {
  systemPrompt: "Tu collectes les demandes.",
  simple: {
    role: "assistant",
    objective: "collecter",
    language: { mode: "auto" },
    tone: "",
    guardrails: [],
    extraInstructions: "",
  },
  fiches: [
    {
      key: "fiche",
      label: "Fiche",
      description: "",
      intent: "",
      fields: [{ name: "contact", label: "Contact", type: "text", required: true }],
      renderTemplate: "# Fiche\n\n{{contact}}\n",
      instructions: "",
    },
  ],
};

const BACKOFFICE_CONFIG = {
  ...MIN_CONFIG,
  searchTool: { ...defaultSearchToolConfig(), statusMode: "internal_filter" as const },
};

describe("création et édition d'un lien public", () => {
  it("refuse une configuration backoffice à la création (422)", async () => {
    const { createChatLinkForOrganization } = await import(
      "@/application/use-cases/links/create-chat-link"
    );
    const deps = {
      confidentialites: { listActives: async () => [] },
      visualTemplates: {},
    } as unknown as Parameters<typeof createChatLinkForOrganization>[0];
    await expect(
      createChatLinkForOrganization(deps, "org-1", null, {
        type: "standard",
        config: BACKOFFICE_CONFIG,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("refuse une configuration backoffice à l'édition (422)", async () => {
    const { updateChatLinkForOrganization } = await import(
      "@/application/use-cases/links/manage-chat-links"
    );
    const existing = {
      id: "link-1",
      organizationId: "org-1",
      label: "Lien",
      type: "standard",
      surface: "page",
      identificationMode: "contact",
      prospectId: null,
      createdBy: null,
      actif: true,
      expiresAt: null,
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
      createdAt: "2026-01-01T00:00:00.000Z",
      channels: channels("contact"),
    };
    const deps = {
      links: { findById: async () => existing, updateDetails: async () => existing },
      visualTemplates: {},
      configs: { createVersion: async () => ({}) },
    } as unknown as Parameters<typeof updateChatLinkForOrganization>[0];
    await expect(
      updateChatLinkForOrganization(deps, "org-1", "link-1", {
        config: BACKOFFICE_CONFIG,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
