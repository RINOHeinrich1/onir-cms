import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  executeFicheTool,
  type FicheToolContext,
  type FicheToolDependencies,
} from "@/application/use-cases/fiches/tool-search";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";
import type {
  FicheSearchToolConfig,
  FicheSearchToolResult,
  FicheToolResultItem,
} from "@/domain/fiche-search-tool";
import { defaultSearchToolConfig } from "@/domain/fiche-search-tool-config";
import type { SearchableFicheDefinition } from "@/domain/fiche-search-validation";
import { pgChatSearchSessionRepository } from "@/infrastructure/db/chat-search-session-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgFicheToolRepository } from "@/infrastructure/db/fiche-tool-repository";
import { makeOrganization, setupDb } from "./helpers/db";

/**
 * E013 — isolation transverses de l'outil de recherche (ADR-0067 §4.8/§10) :
 * session liée à une conversation, à un lien et à une organisation ; nouvelle
 * condition = nouvelle recherche ; les critères ne sont jamais modifiables par
 * `continue_search`.
 */

const STATUSES: FicheStatusDefinition[] = [
  {
    key: "publie",
    label: "Publié",
    order: 0,
    isDefault: true,
    archivedAt: null,
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
];

const DEFINITION: TemplateDefinition = {
  key: "fournisseur",
  label: "Fournisseur",
  description: "",
  systemPrompt: "x",
  fields: [
    { name: "nom", label: "Nom", type: "text", required: true },
    {
      name: "ville",
      label: "Ville",
      type: "select",
      required: false,
      options: ["Antananarivo", "Toamasina"],
    },
  ],
  statuses: STATUSES,
  renderTemplate: "",
};

const FICHE: SearchableFicheDefinition = {
  key: "fournisseur",
  label: "Fournisseur",
  fields: DEFINITION.fields,
  statuses: STATUSES,
};

const CONFIG: FicheSearchToolConfig = {
  ...defaultSearchToolConfig(),
  enabled: true,
  ficheTypes: ["fournisseur"],
  fixedStatusKeys: ["publie"],
};

const CONVERSATION_A1 = "00000000-0000-4000-8000-000000000101";
const CONVERSATION_A2 = "00000000-0000-4000-8000-000000000102";

let pool: Pool;
let orgA: string;
let orgB: string;
let linkA: string;
let linkA2: string;
let linkB: string;

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
  organizationId: string;
  linkId: string;
  ville: string;
  index: number;
}): Promise<string> {
  const fiche = await pgFicheRepository(pool).create(options.organizationId, {
    conversationId: null,
    prospectId: null,
    createdBy: null,
    definition: DEFINITION,
    data: { nom: `Fournisseur ${options.index}`, ville: options.ville },
    chatLinkIds: [options.linkId],
    qualificationStatusKey: "publie",
  });
  await pool.query("UPDATE fiches SET created_at = $2 WHERE id = $1", [
    fiche.id,
    new Date(Date.UTC(2026, 0, 1, 0, options.index)).toISOString(),
  ]);
  return fiche.id;
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
    conversationId: CONVERSATION_A1,
    config: CONFIG,
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
  orgA = await makeOrganization(pool, "Org isolation A");
  orgB = await makeOrganization(pool, "Org isolation B");
  linkA = await insertLink(orgA, "chatbot-a");
  linkA2 = await insertLink(orgA, "chatbot-a2");
  linkB = await insertLink(orgB, "chatbot-b");
  await insertConversation(CONVERSATION_A1, orgA, linkA);
  await insertConversation(CONVERSATION_A2, orgA, linkA);
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_search_sessions");
  await pool.query("DELETE FROM fiches");
});

afterAll(async () => {
  await pool?.end();
});

describe("isolation des sessions de recherche (E013)", () => {
  it("ne réutilise jamais la session d'une autre conversation", async () => {
    await seedFiche({ organizationId: orgA, linkId: linkA, ville: "Antananarivo", index: 0 });
    await seedFiche({ organizationId: orgA, linkId: linkA, ville: "Antananarivo", index: 1 });
    await search(context({ conversationId: CONVERSATION_A1 }), { limit: 1 });

    await expect(next(context({ conversationId: CONVERSATION_A2 }), { limit: 1 })).rejects.toThrow(
      /Aucune recherche active/,
    );
  });

  it("ne réutilise jamais la session d'un autre chatbot ni d'une autre organisation", async () => {
    await seedFiche({ organizationId: orgA, linkId: linkA, ville: "Antananarivo", index: 0 });
    await seedFiche({ organizationId: orgA, linkId: linkA, ville: "Antananarivo", index: 1 });
    await search(context(), { limit: 1 });

    await expect(next(context({ chatLinkId: linkA2 }), { limit: 1 })).rejects.toThrow(
      /Aucune recherche active/,
    );
    await expect(
      next(context({ organizationId: orgB, chatLinkId: linkB }), { limit: 1 }),
    ).rejects.toThrow(/Aucune recherche active/);
  });

  it("get_fiche est limité à l'organisation et aux fiches de collecte sélectionnées", async () => {
    const own = await seedFiche({
      organizationId: orgA,
      linkId: linkA,
      ville: "Antananarivo",
      index: 0,
    });
    const otherLink = await seedFiche({
      organizationId: orgA,
      linkId: linkA2,
      ville: "Antananarivo",
      index: 1,
    });
    const otherOrg = await seedFiche({
      organizationId: orgB,
      linkId: linkB,
      ville: "Antananarivo",
      index: 2,
    });

    const item = (await executeFicheTool(context(), "get_fiche", {
      ficheId: own,
    })) as FicheToolResultItem;
    expect(item.ficheId).toBe(own);

    // Même organisation + même fiche de collecte : accessible, même via un autre chatbot.
    const otherItem = (await executeFicheTool(context(), "get_fiche", {
      ficheId: otherLink,
    })) as FicheToolResultItem;
    expect(otherItem.ficheId).toBe(otherLink);

    // Autre organisation : toujours interdit.
    await expect(executeFicheTool(context(), "get_fiche", { ficheId: otherOrg })).rejects.toThrow(
      /introuvable/,
    );
  });

  it("une nouvelle condition crée une nouvelle session qui pilote continue_search", async () => {
    const antananarivo: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      antananarivo.push(
        await seedFiche({ organizationId: orgA, linkId: linkA, ville: "Antananarivo", index }),
      );
    }
    const toamasina: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      toamasina.push(
        await seedFiche({
          organizationId: orgA,
          linkId: linkA,
          ville: "Toamasina",
          index: index + 10,
        }),
      );
    }

    const first = await search(context(), {
      limit: 2,
      conditions: [{ field: "ville", operator: "eq", value: "Antananarivo" }],
    });
    expect(first.total).toBe(6);

    const second = await search(context(), {
      limit: 2,
      conditions: [{ field: "ville", operator: "eq", value: "Toamasina" }],
    });
    expect(second.total).toBe(4);

    const continued = await next(context(), { limit: 10 });
    expect(continued.total).toBe(4);
    const seen = [...second.items, ...continued.items].map((item) => item.ficheId);
    expect(new Set(seen)).toEqual(new Set(toamasina));
    expect(new Set(seen).size).toBe(4);
    expect(continued.items.some((item) => antananarivo.includes(item.ficheId))).toBe(false);

    const sessions = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM chat_search_sessions WHERE conversation_id = $1",
      [CONVERSATION_A1],
    );
    // Une nouvelle recherche remplace la session active précédente.
    expect(sessions.rows[0]?.count).toBe("1");
  });

  it("continue_search refuse toute modification des critères", async () => {
    await seedFiche({ organizationId: orgA, linkId: linkA, ville: "Antananarivo", index: 0 });
    await seedFiche({ organizationId: orgA, linkId: linkA, ville: "Antananarivo", index: 1 });
    await search(context(), { limit: 1 });

    await expect(
      next(context(), {
        limit: 1,
        conditions: [{ field: "ville", operator: "eq", value: "Toamasina" }],
      }),
    ).rejects.toThrow(/ne modifie pas les critères/);
  });
});
