import { describe, expect, it } from "vitest";
import type {
  ChatSearchSession,
  ChatSearchSessionRepository,
  ChatSearchSessionScope,
  CreateChatSearchSessionInput,
} from "@/application/ports/chat-search-session-repository";
import type {
  FicheToolLookup,
  FicheToolRepository,
  FicheToolRow,
  FicheToolSearchCriteria,
  FicheToolSearchResult,
} from "@/application/ports/fiche-tool-repository";
import {
  executeFicheTool,
  type FicheToolContext,
  type FicheToolDependencies,
} from "@/application/use-cases/fiches/tool-search";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { FicheSearchToolResult, FicheToolResultItem } from "@/domain/fiche-search-tool";
import { defaultSearchToolConfig } from "@/domain/fiche-search-tool-config";
import type { SearchableFicheDefinition } from "@/domain/fiche-search-validation";

const DEFINITION: TemplateDefinition = {
  key: "maison",
  label: "Maison",
  description: "",
  systemPrompt: "",
  fields: [{ name: "titre", label: "Titre", type: "text", required: true }],
  renderTemplate: "",
};

const FICHE: SearchableFicheDefinition = {
  key: "maison",
  label: "Maison",
  fields: DEFINITION.fields,
};

const ROWS: FicheToolRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `fiche-${index + 1}`,
  definition: DEFINITION,
  data: { titre: `Fiche ${index + 1}` },
  qualificationStatusKey: null,
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
}));

class MemorySessions implements ChatSearchSessionRepository {
  sessions: ChatSearchSession[] = [];
  private sequence = 0;

  async create(input: CreateChatSearchSessionInput): Promise<ChatSearchSession> {
    this.sessions = this.sessions.filter(
      (session) =>
        !(
          session.organizationId === input.organizationId &&
          session.chatLinkId === input.chatLinkId &&
          session.conversationId === input.conversationId
        ),
    );
    this.sequence += 1;
    const session: ChatSearchSession = {
      ...input,
      id: `session-${this.sequence}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, this.sequence)).toISOString(),
    };
    this.sessions.push(session);
    return session;
  }

  async latestActive(scope: ChatSearchSessionScope & { now?: Date }) {
    const now = scope.now ?? new Date();
    const candidates = this.sessions
      .filter(
        (session) =>
          session.organizationId === scope.organizationId &&
          session.chatLinkId === scope.chatLinkId &&
          session.conversationId === scope.conversationId &&
          new Date(session.expiresAt).getTime() > now.getTime(),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return candidates[0] ?? null;
  }

  async updateOffset(scope: ChatSearchSessionScope & { sessionId: string; offset: number }) {
    const session = this.sessions.find(
      (entry) =>
        entry.id === scope.sessionId &&
        entry.organizationId === scope.organizationId &&
        entry.chatLinkId === scope.chatLinkId &&
        entry.conversationId === scope.conversationId,
    );
    if (session !== undefined) session.offset = scope.offset;
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter(
      (session) => new Date(session.expiresAt).getTime() > now.getTime(),
    );
    return before - this.sessions.length;
  }
}

class MemoryFiches implements FicheToolRepository {
  hidden = new Set<string>();

  async searchScoped(_criteria: FicheToolSearchCriteria): Promise<FicheToolSearchResult> {
    const ids = ROWS.filter((row) => !this.hidden.has(row.id)).map((row) => row.id);
    return { ids, total: ids.length };
  }

  async countScoped(): Promise<number> {
    return ROWS.filter((row) => !this.hidden.has(row.id)).length;
  }

  async findScopedById(lookup: FicheToolLookup): Promise<FicheToolRow | null> {
    if (this.hidden.has(lookup.ficheId)) return null;
    return ROWS.find((row) => row.id === lookup.ficheId) ?? null;
  }
}

function dependencies(
  fiches = new MemoryFiches(),
  sessions = new MemorySessions(),
  now?: () => Date,
): FicheToolDependencies {
  return { fiches, sessions, ...(now === undefined ? {} : { now }) };
}

function context(
  deps: FicheToolDependencies,
  overrides: Partial<FicheToolContext> = {},
): FicheToolContext {
  return {
    organizationId: "org-1",
    chatLinkId: "link-1",
    conversationId: "conversation-1",
    config: { ...defaultSearchToolConfig(), enabled: true },
    fiches: [FICHE],
    deps,
    ...overrides,
  };
}

async function search(
  ctx: FicheToolContext,
  args: Record<string, unknown> = {},
): Promise<FicheSearchToolResult> {
  return (await executeFicheTool(ctx, "search_fiches", args)) as FicheSearchToolResult;
}

async function next(
  ctx: FicheToolContext,
  args: Record<string, unknown> = {},
): Promise<FicheSearchToolResult> {
  return (await executeFicheTool(ctx, "continue_search", args)) as FicheSearchToolResult;
}

describe("sessions de recherche (ADR-0067 §4.8)", () => {
  it("crée une session et pagine sans doublon avec offset/hasMore", async () => {
    const sessions = new MemorySessions();
    const ctx = context(dependencies(new MemoryFiches(), sessions));

    const first = await search(ctx, { limit: 2 });
    expect(first.total).toBe(6);
    expect(first.hasMore).toBe(true);
    expect(first.page).toEqual({ limit: 2, offset: 0 });
    expect(first.items.map((item) => item.ficheId)).toEqual(["fiche-1", "fiche-2"]);
    expect(sessions.sessions[0]?.offset).toBe(2);

    const second = await next(ctx, { limit: 2 });
    expect(second.page).toEqual({ limit: 2, offset: 2 });
    expect(second.hasMore).toBe(true);
    expect(second.items.map((item) => item.ficheId)).toEqual(["fiche-3", "fiche-4"]);
    expect(sessions.sessions[0]?.offset).toBe(4);

    const third = await next(ctx, { limit: 2 });
    expect(third.page).toEqual({ limit: 2, offset: 4 });
    expect(third.hasMore).toBe(false);
    expect(third.items.map((item) => item.ficheId)).toEqual(["fiche-5", "fiche-6"]);

    const exhausted = await next(ctx, { limit: 2 });
    expect(exhausted.items).toEqual([]);
    expect(exhausted.total).toBe(6);
    expect(exhausted.hasMore).toBe(false);

    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.ficheId);
    expect(new Set(seen).size).toBe(6);
  });

  it("remplace la session active lors d'une nouvelle recherche", async () => {
    const sessions = new MemorySessions();
    const ctx = context(dependencies(new MemoryFiches(), sessions));
    await search(ctx, { limit: 2 });
    await next(ctx, { limit: 2 });
    expect(sessions.sessions[0]?.offset).toBe(4);

    await search(ctx, { limit: 3 });
    expect(sessions.sessions).toHaveLength(1);
    expect(sessions.sessions[0]?.offset).toBe(3);
    expect(sessions.sessions[0]?.criteria.query).toBeNull();
  });

  it("interdit de modifier les critères via continue_search", async () => {
    const ctx = context(dependencies());
    await search(ctx, { limit: 2 });
    await expect(next(ctx, { limit: 2, query: "autre" })).rejects.toThrow(/critères/);
    await expect(next(ctx, { limit: 2, conditions: [] })).rejects.toThrow(/critères/);
    await expect(next(ctx, { limit: 2, ficheTypes: ["terrain"] })).rejects.toThrow(/critères/);
  });

  it("refuse une continuation après expiration de la session", async () => {
    const sessions = new MemorySessions();
    const early = new Date("2026-01-01T00:00:00.000Z");
    const ctx = context(dependencies(new MemoryFiches(), sessions, () => early));
    await search(ctx, { limit: 2 });

    const lateCtx = context(
      dependencies(new MemoryFiches(), sessions, () => new Date("2026-01-01T01:00:00.000Z")),
    );
    await expect(next(lateCtx, { limit: 2 })).rejects.toThrow(/Aucune recherche active/);
  });

  it("ignore une fiche supprimée ou archivée entre deux pages sans changer le total", async () => {
    const fiches = new MemoryFiches();
    const sessions = new MemorySessions();
    const ctx = context(dependencies(fiches, sessions));
    await search(ctx, { limit: 2 });

    fiches.hidden.add("fiche-3");
    const second = await next(ctx, { limit: 2 });
    expect(second.total).toBe(6);
    expect(second.items.map((item) => item.ficheId)).toEqual(["fiche-4"]);
    expect(second.page).toEqual({ limit: 2, offset: 2 });
    expect(second.hasMore).toBe(true);
  });

  it("expose get_fiche, list_fiche_types et count_fiches", async () => {
    const ctx = context(dependencies());
    const item = (await executeFicheTool(ctx, "get_fiche", {
      ficheId: "fiche-2",
    })) as FicheToolResultItem;
    expect(item.ficheId).toBe("fiche-2");
    expect(item.fields).toEqual([{ key: "titre", label: "Titre", type: "text", value: "Fiche 2" }]);
    await expect(executeFicheTool(ctx, "get_fiche", { ficheId: "absent" })).rejects.toThrow(
      /introuvable/,
    );

    expect(await executeFicheTool(ctx, "list_fiche_types", {})).toEqual([
      { key: "maison", label: "Maison" },
    ]);
    expect(await executeFicheTool(ctx, "count_fiches", {})).toEqual({ total: 6 });
    await expect(executeFicheTool(ctx, "outil_inconnu", {})).rejects.toThrow(/inconnu/);
  });
});
