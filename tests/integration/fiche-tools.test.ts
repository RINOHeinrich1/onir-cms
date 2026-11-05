import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  executeFicheTool,
  type FicheToolContext,
  type FicheToolDependencies,
} from "@/application/use-cases/fiches/tool-search";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";
import {
  conversationRotationOffset,
  type FicheCountToolResult,
  type FicheSearchToolConfig,
  type FicheSearchToolResult,
  type FicheToolResultItem,
  type FicheTypeToolResult,
} from "@/domain/fiche-search-tool";
import { defaultSearchToolConfig } from "@/domain/fiche-search-tool-config";
import type { SearchableFicheDefinition } from "@/domain/fiche-search-validation";
import { pgChatSearchSessionRepository } from "@/infrastructure/db/chat-search-session-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgFicheToolRepository } from "@/infrastructure/db/fiche-tool-repository";
import { makeOrganization, setupDb } from "./helpers/db";

const STATUSES: FicheStatusDefinition[] = [
  {
    key: "publie",
    label: "Publié",
    order: 0,
    isDefault: true,
    archivedAt: null,
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
  {
    key: "brouillon",
    label: "Brouillon",
    order: 1,
    isDefault: false,
    archivedAt: null,
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
];

const DEFINITION: TemplateDefinition = {
  key: "maison",
  label: "Maison",
  description: "",
  systemPrompt: "x",
  fields: [
    { name: "titre", label: "Titre", type: "text", required: true },
    {
      name: "ville",
      label: "Ville",
      type: "select",
      required: false,
      options: ["Antananarivo", "Toamasina"],
    },
    { name: "loyer", label: "Loyer", type: "number", required: false, unit: "€" },
    { name: "disponible", label: "Disponible", type: "date", required: false },
    { name: "tags", label: "Tags", type: "multi", required: false },
    { name: "photo", label: "Photo", type: "image", required: false },
    { name: "cin", label: "CIN", type: "file", required: false },
  ],
  statuses: STATUSES,
  renderTemplate: "",
};

const FICHE: SearchableFicheDefinition = {
  key: "maison",
  label: "Maison",
  fields: DEFINITION.fields,
  statuses: STATUSES,
};

const HIDDEN_CONFIG: FicheSearchToolConfig = {
  ...defaultSearchToolConfig(),
  enabled: true,
  ficheTypes: ["maison"],
  fixedStatusKeys: ["publie"],
};

let pool: Pool;
let orgA: string;
let orgB: string;
let linkA: string;
let linkB: string;
let conversationA1: string;
let conversationA2: string;

function pickDistinctConversations(): [string, string] {
  const first = "00000000-0000-4000-8000-000000000001";
  const firstOffset = conversationRotationOffset(first, 30);
  for (let index = 2; index < 500; index += 1) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    if (conversationRotationOffset(id, 30) !== firstOffset) return [first, id];
  }
  throw new Error("Impossible de trouver deux conversations avec des rotations distinctes");
}

async function insertLink(organizationId: string, label: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chat_links (organization_id, token_hash, type, label)
     VALUES ($1, $2, 'standard', $3) RETURNING id`,
    [organizationId, `hash-${label}-${organizationId}`, label],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("Échec de création du lien");
  return row.id;
}

async function insertConversation(
  id: string,
  organizationId: string,
  linkId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO conversations (id, organization_id, link_id, visitor_nom)
     VALUES ($1, $2, $3, 'Test')`,
    [id, organizationId, linkId],
  );
}

async function seedFiche(options: {
  organizationId?: string;
  linkId?: string;
  conversationId?: string | null;
  status?: string | null;
  data: Record<string, unknown>;
  createdAt?: Date;
}): Promise<string> {
  const repository = pgFicheRepository(pool);
  const fiche = await repository.create(options.organizationId ?? orgA, {
    conversationId: options.conversationId ?? null,
    prospectId: null,
    createdBy: null,
    definition: DEFINITION,
    data: options.data,
    chatLinkIds: options.linkId === undefined ? [] : [options.linkId],
    qualificationStatusKey: options.status === undefined ? "publie" : options.status,
  });
  if (options.createdAt !== undefined) {
    await pool.query("UPDATE fiches SET created_at = $2 WHERE id = $1", [
      fiche.id,
      options.createdAt.toISOString(),
    ]);
  }
  return fiche.id;
}

async function seedSeries(
  count: number,
  options: {
    organizationId?: string;
    linkId?: string;
    conversationId?: string | null;
    status?: string | null;
    data?: (index: number) => Record<string, unknown>;
  } = {},
): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push(
      await seedFiche({
        ...options,
        data: options.data?.(index) ?? { titre: `Fiche ${index + 1}`, loyer: index },
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      }),
    );
  }
  return ids;
}

function dependencies(): FicheToolDependencies {
  return {
    fiches: pgFicheToolRepository(pool),
    sessions: pgChatSearchSessionRepository(pool),
  };
}

function context(overrides: Partial<FicheToolContext> = {}): FicheToolContext {
  return {
    organizationId: orgA,
    chatLinkId: linkA,
    conversationId: conversationA1,
    config: HIDDEN_CONFIG,
    fiches: [FICHE],
    deps: dependencies(),
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

beforeAll(async () => {
  pool = await setupDb();
  orgA = await makeOrganization(pool, "Org outils A");
  orgB = await makeOrganization(pool, "Org outils B");
  linkA = await insertLink(orgA, "chatbot-a");
  linkB = await insertLink(orgB, "chatbot-b");
  [conversationA1, conversationA2] = pickDistinctConversations();
  await insertConversation(conversationA1, orgA, linkA);
  await insertConversation(conversationA2, orgA, linkA);
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_search_sessions");
  await pool.query("DELETE FROM fiches");
});

afterAll(async () => {
  await pool?.end();
});

describe("outils internes de recherche (ADR-0067 §4)", () => {
  it("pagine 30 fiches en 10/10/10 sans doublon", async () => {
    const ids = await seedSeries(30, { conversationId: conversationA1, linkId: linkA });
    const first = await search(context(), { limit: 10 });
    expect(first.total).toBe(30);
    expect(first.hasMore).toBe(true);
    expect(first.items).toHaveLength(10);
    expect(first.page).toEqual({ limit: 10, offset: 0 });

    const second = await next(context(), { limit: 10 });
    expect(second.page).toEqual({ limit: 10, offset: 10 });
    expect(second.hasMore).toBe(true);
    expect(second.items).toHaveLength(10);

    const third = await next(context(), { limit: 10 });
    expect(third.page).toEqual({ limit: 10, offset: 20 });
    expect(third.hasMore).toBe(false);
    expect(third.items).toHaveLength(10);

    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.ficheId);
    expect(new Set(seen).size).toBe(30);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it("conserve les critères et le statut fixe pendant la continuation", async () => {
    const matching = await seedSeries(12, {
      conversationId: conversationA1,
      linkId: linkA,
      data: (index) => ({ titre: `Maison ${index}`, ville: "Antananarivo" }),
    });
    await seedSeries(8, {
      conversationId: conversationA1,
      linkId: linkA,
      status: "brouillon",
      data: (index) => ({ titre: `Brouillon ${index}`, ville: "Antananarivo" }),
    });
    await seedSeries(10, {
      conversationId: conversationA1,
      linkId: linkA,
      data: (index) => ({ titre: `Ailleurs ${index}`, ville: "Toamasina" }),
    });

    const ctx = context();
    const first = await search(ctx, {
      limit: 5,
      conditions: [{ field: "ville", operator: "eq", value: "Antananarivo" }],
    });
    expect(first.total).toBe(12);
    const second = await next(ctx, { limit: 5 });
    const third = await next(ctx, { limit: 5 });
    expect(second.page).toEqual({ limit: 5, offset: 5 });
    expect(third.page).toEqual({ limit: 5, offset: 10 });
    expect(third.hasMore).toBe(false);

    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.ficheId);
    expect(seen).toHaveLength(12);
    expect(new Set(seen)).toEqual(new Set(matching));
    for (const item of [...first.items, ...second.items, ...third.items]) {
      expect(item).not.toHaveProperty("statusKey");
    }
  });

  it("exclut les fiches archivées et ne projette jamais les champs fichier", async () => {
    const kept = await seedSeries(3, {
      conversationId: conversationA1,
      linkId: linkA,
      data: (index) => ({ titre: `Fiche ${index}`, cin: "secret.pdf", loyer: 100 + index }),
    });
    const archived = kept[1] as string;
    await pool.query("UPDATE fiches SET archivee = true WHERE id = $1", [archived]);

    const result = await search(context(), { limit: 10 });
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.ficheId)).not.toContain(archived);
    for (const item of result.items) {
      expect(item.fields.map((field) => field.key)).not.toContain("cin");
      expect(item.fields.map((field) => field.key)).not.toContain("qualification_status_key");
    }

    await expect(executeFicheTool(context(), "get_fiche", { ficheId: archived })).rejects.toThrow(
      /introuvable/,
    );
  });

  it("applique les opérateurs typés et la recherche texte", async () => {
    await seedFiche({
      conversationId: conversationA1,
      linkId: linkA,
      data: {
        titre: "Maison Antananarivo",
        ville: "Antananarivo",
        loyer: 100,
        disponible: "2026-11-01",
        tags: ["a", "b"],
      },
      createdAt: new Date(Date.UTC(2026, 0, 1)),
    });
    await seedFiche({
      conversationId: conversationA1,
      linkId: linkA,
      data: {
        titre: "Maison Toamasina",
        ville: "Toamasina",
        loyer: 500,
        disponible: "2026-12-01",
        tags: ["b"],
      },
      createdAt: new Date(Date.UTC(2026, 0, 2)),
    });
    const third = await seedFiche({
      conversationId: conversationA1,
      linkId: linkA,
      data: {
        titre: "Villa",
        ville: "Antananarivo",
        loyer: 1000,
        disponible: "2026-10-01",
        tags: ["c"],
      },
      createdAt: new Date(Date.UTC(2026, 0, 3)),
    });

    const byNumber = await search(context(), {
      limit: 10,
      conditions: [{ field: "loyer", operator: "lt", value: 500 }],
    });
    expect(byNumber.total).toBe(1);

    const byBetween = await search(context(), {
      limit: 10,
      conditions: [{ field: "loyer", operator: "between", value: [100, 600] }],
    });
    expect(byBetween.total).toBe(2);

    const byDate = await search(context(), {
      limit: 10,
      conditions: [{ field: "disponible", operator: "gte", value: "2026-11-01" }],
    });
    expect(byDate.total).toBe(2);

    const byMulti = await search(context(), {
      limit: 10,
      conditions: [{ field: "tags", operator: "contains_any", value: ["a", "c"] }],
    });
    expect(byMulti.total).toBe(2);

    const byText = await search(context(), { limit: 10, query: "maison" });
    expect(byText.total).toBe(2);

    const byEmpty = await search(context(), {
      limit: 10,
      conditions: [{ field: "photo", operator: "is_empty" }],
    });
    expect(byEmpty.total).toBe(3);
    expect(third).toBeTruthy();
  });

  it("isole strictement les organisations et le périmètre du chatbot", async () => {
    const fichesA = await seedSeries(2, { conversationId: conversationA1, linkId: linkA });
    const fichesB = await seedSeries(2, {
      organizationId: orgB,
      linkId: linkB,
      conversationId: null,
    });

    const resultA = await search(context(), { limit: 10 });
    expect(resultA.total).toBe(2);
    expect(new Set(resultA.items.map((item) => item.ficheId))).toEqual(new Set(fichesA));

    const resultB = await search(
      context({ organizationId: orgB, chatLinkId: linkB, fiches: [FICHE] }),
      { limit: 10 },
    );
    expect(resultB.total).toBe(2);
    expect(new Set(resultB.items.map((item) => item.ficheId))).toEqual(new Set(fichesB));

    await expect(
      executeFicheTool(context(), "get_fiche", { ficheId: fichesB[0] as string }),
    ).rejects.toThrow(/introuvable/);
  });

  it("refuse une continuation quand la session est expirée", async () => {
    await seedSeries(3, { conversationId: conversationA1, linkId: linkA });
    await search(context(), { limit: 2 });
    await pool.query(
      `UPDATE chat_search_sessions
          SET expires_at = now() - INTERVAL '1 minute'
        WHERE conversation_id = $1`,
      [conversationA1],
    );
    await expect(next(context(), { limit: 2 })).rejects.toThrow(/Aucune recherche active/);
  });

  it("n'ajoute pas les nouveaux résultats à une session ouverte", async () => {
    await seedSeries(3, { conversationId: conversationA1, linkId: linkA });
    const first = await search(context(), { limit: 2 });
    const extra = await seedFiche({
      conversationId: conversationA1,
      linkId: linkA,
      data: { titre: "Nouvelle fiche" },
      createdAt: new Date(Date.UTC(2026, 0, 10)),
    });

    const second = await next(context(), { limit: 2 });
    expect(second.total).toBe(3);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect([...first.items, ...second.items].map((item) => item.ficheId)).not.toContain(extra);
  });

  it("respecte le tri created_at stable", async () => {
    const ids = await seedSeries(5, { conversationId: conversationA1, linkId: linkA });
    const ctx = context({ config: { ...HIDDEN_CONFIG, sortMode: "created_at" } });
    const first = await search(ctx, { limit: 3 });
    expect(first.items.map((item) => item.ficheId)).toEqual(ids.slice(0, 3));
    const second = await next(ctx, { limit: 3 });
    expect(second.items.map((item) => item.ficheId)).toEqual(ids.slice(3, 5));
  });

  it("garde une rotation stable par conversation et différente entre conversations", async () => {
    await seedSeries(30, { conversationId: conversationA1, linkId: linkA });
    const first = await search(context({ conversationId: conversationA1 }), { limit: 20 });
    const again = await search(context({ conversationId: conversationA1 }), { limit: 20 });
    const other = await search(context({ conversationId: conversationA2 }), { limit: 20 });

    const firstIds = first.items.map((item) => item.ficheId);
    expect(again.items.map((item) => item.ficheId)).toEqual(firstIds);
    expect(other.items.map((item) => item.ficheId)).not.toEqual(firstIds);
  });

  it("expose count_fiches, list_fiche_types et get_fiche", async () => {
    const ids = await seedSeries(4, {
      conversationId: conversationA1,
      linkId: linkA,
      data: (index) => ({ titre: `Fiche ${index}`, cin: "secret.pdf" }),
    });
    const count = (await executeFicheTool(context(), "count_fiches", {
      conditions: [{ field: "titre", operator: "contains", value: "fiche" }],
    })) as FicheCountToolResult;
    expect(count.total).toBe(4);

    const types = (await executeFicheTool(
      context(),
      "list_fiche_types",
      {},
    )) as FicheTypeToolResult[];
    expect(types).toEqual([{ key: "maison", label: "Maison" }]);

    const item = (await executeFicheTool(context(), "get_fiche", {
      ficheId: ids[0],
    })) as FicheToolResultItem;
    expect(item.ficheId).toBe(ids[0]);
    expect(item.fields.map((field) => field.key)).not.toContain("cin");
    expect(item).not.toHaveProperty("statusKey");
  });

  it("expose le statut uniquement en mode backoffice internal_filter", async () => {
    await seedSeries(2, { conversationId: conversationA1, linkId: linkA });
    const ctx = context({
      config: { ...HIDDEN_CONFIG, statusMode: "internal_filter", fixedStatusKeys: ["publie"] },
    });
    const result = await search(ctx, { limit: 10 });
    expect(result.items.every((item) => item.statusKey === "publie")).toBe(true);
  });
});
