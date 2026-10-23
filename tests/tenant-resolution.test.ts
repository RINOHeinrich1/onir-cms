import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConfidentialiteRepository } from "@/application/ports/confidentialite-repository";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type { SessionRepository } from "@/application/ports/session-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { createChatLink } from "@/application/use-cases/links/create-chat-link";
import { switchOrganization } from "@/application/use-cases/organizations/switch-organization";
import type { ChatLink } from "@/domain/entities/chat";

const ACTOR = {
  id: "admin-a",
  role: "admin" as const,
  organizationId: "org-a",
  isSuperAdmin: false,
};

beforeEach(() => {
  vi.stubEnv("LINK_TOKEN_KEY", "f".repeat(64));
});

function link(organizationId: string): ChatLink {
  return {
    id: "link-1",
    organizationId,
    label: "",
    type: "standard",
    prospectId: null,
    createdBy: "admin-a",
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

function createDeps(created: { organizationId?: string }): {
  links: ChatLinkRepository;
  prospects: ProspectRepository;
  templates: ChatTemplateRepository;
  confidentialites: ConfidentialiteRepository;
  visualTemplates: VisualTemplateRepository;
} {
  const links = {
    create: vi.fn(async (organizationId: string) => {
      created.organizationId = organizationId;
      return link(organizationId);
    }),
  } as unknown as ChatLinkRepository;
  const prospects = {} as ProspectRepository;
  const templates = {
    currentVersion: async () => ({
      id: "v1",
      templateId: "t1",
      version: 1,
      definition: {
        key: "fiche-projet",
        label: "",
        description: "",
        systemPrompt: "",
        fields: [],
        renderTemplate: "",
      },
      createdBy: null,
      createdAt: new Date(0).toISOString(),
    }),
  } as unknown as ChatTemplateRepository;
  const confidentialites = {
    listActives: async () => [],
  } as unknown as ConfidentialiteRepository;
  const visualTemplates = {} as VisualTemplateRepository;
  return { links, prospects, templates, confidentialites, visualTemplates };
}

describe("résolution tenant — aucun organizationId client (ADR-0025 §4)", () => {
  it("createChatLink ignore un organizationId fourni dans le body et utilise l'acteur", async () => {
    const created: { organizationId?: string } = {};
    const deps = createDeps(created);
    await createChatLink(deps, ACTOR, {
      type: "standard",
      organizationId: "org-b",
    });
    expect(created.organizationId).toBe("org-a");
  });
});

describe("switchOrganization — vérifications serveur", () => {
  function deps(options: { role?: "admin" | null; suspended?: boolean }) {
    const organizations: OrganizationRepository = {
      create: async () => {
        throw new Error("non utilisé");
      },
      findById: async (id) => ({
        id,
        name: id,
        suspendedAt: options.suspended === true ? new Date(0).toISOString() : null,
        createdBy: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }),
      findByName: async () => null,
      listAll: async () => [],
      listForUser: async () => [],
      rename: async () => null,
      setSuspended: async () => null,
      provisionDefaults: async () => undefined,
    };
    const memberships = {
      findRole: async () => options.role ?? null,
    } as unknown as MembershipRepository;
    const sessions = {
      setActiveOrganization: vi.fn(async () => undefined),
    } as unknown as SessionRepository;
    const users = {
      updateLastOrganization: vi.fn(async () => undefined),
    } as unknown as UserRepository;
    return { organizations, memberships, sessions, users };
  }

  it("refuse une organisation sans membership (403)", async () => {
    const d = deps({ role: null });
    await expect(switchOrganization(d, ACTOR, "s1", { organizationId: "org-b" })).rejects.toThrow(
      /pas membre/i,
    );
    expect(d.sessions.setActiveOrganization).not.toHaveBeenCalled();
  });

  it("refuse une organisation suspendue", async () => {
    const d = deps({ role: "admin", suspended: true });
    await expect(switchOrganization(d, ACTOR, "s1", { organizationId: "org-b" })).rejects.toThrow(
      /suspendue/i,
    );
  });

  it("met à jour la session et la dernière organisation", async () => {
    const d = deps({ role: "admin" });
    const result = await switchOrganization(d, ACTOR, "s1", { organizationId: "org-b" });
    expect(result.organization.id).toBe("org-b");
    expect(d.sessions.setActiveOrganization).toHaveBeenCalledWith("s1", "org-b");
    expect(d.users.updateLastOrganization).toHaveBeenCalledWith("admin-a", "org-b");
  });

  it("super-admin : bascule autorisée même sans membership", async () => {
    const d = deps({ role: null });
    const result = await switchOrganization({ ...d }, { ...ACTOR, isSuperAdmin: true }, "s1", {
      organizationId: "org-b",
    });
    expect(result.organization.id).toBe("org-b");
  });
});
