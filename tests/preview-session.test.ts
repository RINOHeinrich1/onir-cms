import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type {
  CreatePreviewSessionInput,
  PreviewSession,
  PreviewSessionRepository,
  UpdatePreviewSessionInput,
} from "@/application/ports/preview-session-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { savePreviewSession } from "@/application/use-cases/links/manage-preview-session";
import type { ChatLink } from "@/domain/entities/chat";
import { hashPreviewToken } from "@/domain/preview-token";

const ACTOR: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const LINK = {
  id: "link-1",
  organizationId: "org-1",
} as ChatLink;

function deps(overrides: { invalidTemplate?: boolean } = {}) {
  const sessions = new Map<string, PreviewSession>();
  let creates = 0;
  let updates = 0;
  const previews: PreviewSessionRepository = {
    create: vi.fn(async (input: CreatePreviewSessionInput) => {
      creates += 1;
      const session: PreviewSession = {
        id: `session-${creates}`,
        tokenHash: input.tokenHash,
        userId: input.userId,
        organizationId: input.organizationId,
        linkId: input.linkId,
        surface: input.surface,
        templateId: input.templateId,
        templateVersion: input.templateVersion,
        params: input.params,
        expiresAt: input.expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessions.set(input.tokenHash, session);
      return session;
    }),
    updateByToken: vi.fn(async (tokenHash: string, input: UpdatePreviewSessionInput) => {
      updates += 1;
      const current = sessions.get(tokenHash);
      if (current === undefined) return null;
      const next: PreviewSession = {
        ...current,
        ...input,
        expiresAt: input.expiresAt.toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessions.set(tokenHash, next);
      return next;
    }),
    findByTokenHash: async (tokenHash) => sessions.get(tokenHash) ?? null,
    deleteExpired: vi.fn(async () => 0),
  };
  const links = {
    findById: vi.fn(async () => LINK),
  } as unknown as ChatLinkRepository;
  const templates = {
    findByIdForOrganization: vi.fn(async () =>
      overrides.invalidTemplate ? null : ({ id: "tpl-1" } as never),
    ),
    findVersion: vi.fn(async () =>
      overrides.invalidTemplate ? null : ({ id: "version-1" } as never),
    ),
  } as unknown as VisualTemplateRepository;
  return {
    dependencies: { links, templates, previews },
    sessions,
    counts: () => ({ creates, updates }),
  };
}

describe("sessions d'aperçu", () => {
  it("crée un token court et stocke seulement son hash", async () => {
    const fake = deps();
    const result = await savePreviewSession(fake.dependencies, ACTOR, LINK.id, {
      surface: "page",
      template: "tpl-1@1.0.0",
      params: { site: { title: "Nutriva" } },
    });

    expect(result.token.length).toBeGreaterThan(20);
    expect(fake.sessions.has(result.token)).toBe(false);
    const stored = fake.sessions.get(hashPreviewToken(result.token));
    expect(stored?.templateId).toBe("tpl-1");
    expect(stored?.templateVersion).toBe("1.0.0");
    expect(stored?.params).toEqual({ site: { title: "Nutriva" } });
  });

  it("met à jour la même session avec le token existant", async () => {
    const fake = deps();
    const first = await savePreviewSession(fake.dependencies, ACTOR, LINK.id, {
      surface: "page",
      template: "tpl-1@1.0.0",
      params: { a: "un" },
    });
    const second = await savePreviewSession(fake.dependencies, ACTOR, LINK.id, {
      token: first.token,
      surface: "page",
      template: "tpl-1@1.0.0",
      params: { a: "deux" },
    });

    expect(second.token).toBe(first.token);
    expect(fake.counts()).toEqual({ creates: 1, updates: 1 });
    expect(fake.sessions.get(hashPreviewToken(first.token))?.params).toEqual({ a: "deux" });
  });

  it("crée une nouvelle session si le token est inconnu", async () => {
    const fake = deps();
    const result = await savePreviewSession(fake.dependencies, ACTOR, LINK.id, {
      token: "inconnu",
      surface: "page",
      template: "tpl-1@1.0.0",
      params: {},
    });
    expect(result.token).not.toBe("inconnu");
    expect(fake.counts().creates).toBe(1);
  });

  it("refuse un template ou une version introuvable", async () => {
    const fake = deps({ invalidTemplate: true });
    await expect(
      savePreviewSession(fake.dependencies, ACTOR, LINK.id, {
        surface: "page",
        template: "tpl-1@9.9.9",
        params: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
