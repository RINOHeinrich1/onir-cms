import { describe, expect, it } from "vitest";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { resolveLinkChannels } from "@/application/use-cases/links/link-channels";
import type { ChatLink } from "@/domain/entities/chat";
import { channelsForLink, legacyChannelFields } from "@/domain/entities/chat";

const visualTemplates = {
  findAssignedById: async () => null,
  findVersion: async () => null,
} as unknown as VisualTemplateRepository;

function link(overrides: Partial<ChatLink> = {}): ChatLink {
  return {
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

describe("channelsForLink", () => {
  it("dérive les canaux d'une ligne legacy page", () => {
    const channels = channelsForLink(link());
    expect(channels.page.enabled).toBe(true);
    expect(channels.widget.enabled).toBe(false);
    expect(channels.widget.identificationMode).toBe("anonymous");
    expect(legacyChannelFields(channels).surface).toBe("page");
  });

  it("dérive un widget legacy en canal widget actif", () => {
    const channels = channelsForLink(
      link({ surface: "widget", widgetConfig: { position: "bottom-left" } }),
    );
    expect(channels.page.enabled).toBe(false);
    expect(channels.widget.enabled).toBe(true);
    expect(channels.widget.widgetConfig.position).toBe("bottom-left");
    expect(legacyChannelFields(channels).surface).toBe("widget");
  });
});

describe("resolveLinkChannels", () => {
  it("active page et laisse widget désactivé avec sa configuration par défaut", async () => {
    const channels = await resolveLinkChannels({
      type: "standard",
      source: {
        channels: {
          page: { enabled: true, identificationMode: "anonymous" },
          widget: { enabled: false },
        },
      },
      defaultConfidentialiteId: "conf-1",
      visualTemplates,
      organizationId: "org-1",
    });
    expect(channels.page.enabled).toBe(true);
    expect(channels.page.identificationMode).toBe("anonymous");
    expect(channels.page.confidentialiteId).toBe("conf-1");
    expect(channels.widget.enabled).toBe(false);
    expect(channels.widget.identificationMode).toBe("anonymous");
  });

  it("force l'anonymat du widget standard", async () => {
    const channels = await resolveLinkChannels({
      type: "standard",
      source: {
        channels: {
          page: { enabled: false },
          widget: { enabled: false, identificationMode: "anonymous" },
        },
      },
      visualTemplates,
      organizationId: "org-1",
    });
    expect(channels.widget.identificationMode).toBe("anonymous");
  });

  it("refuse un widget standard avec formulaire de contact", async () => {
    await expect(
      resolveLinkChannels({
        type: "standard",
        source: { channels: { widget: { enabled: true, identificationMode: "contact" } } },
        visualTemplates,
        organizationId: "org-1",
      }),
    ).rejects.toThrow(/widget standard/i);
  });

  it("refuse une politique de confidentialité sur le widget", async () => {
    await expect(
      resolveLinkChannels({
        type: "standard",
        source: { channels: { widget: { enabled: true, confidentialiteId: "conf-1" } } },
        visualTemplates,
        organizationId: "org-1",
      }),
    ).rejects.toThrow(/politique de confidentialité/i);
  });
});
