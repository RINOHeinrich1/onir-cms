import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  executeFicheTool,
  type FicheToolContext,
  type FicheToolDependencies,
} from "@/application/use-cases/fiches/tool-search";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";
import type { FicheSearchToolConfig, FicheSearchToolResult } from "@/domain/fiche-search-tool";
import { defaultSearchToolConfig } from "@/domain/fiche-search-tool-config";
import type { SearchableFicheDefinition } from "@/domain/fiche-search-validation";
import { pgChatSearchSessionRepository } from "@/infrastructure/db/chat-search-session-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgFicheToolRepository } from "@/infrastructure/db/fiche-tool-repository";
import { makeOrganization, setupDb } from "./helpers/db";

/**
 * E014 — après expiration, `continue_search` doit demander une nouvelle
 * recherche (ADR-0067 §4.8). La session ne doit pas être ressuscitée.
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
  fields: [{ name: "nom", label: "Nom", type: "text", required: true }],
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
  ficheTypes: ["fournisseur"],
  fixedStatusKeys: ["publie"],
};

const CONVERSATION = "00000000-0000-4000-8000-000000000201";

let pool: Pool;
let org: string;
let link: string;

function context(): FicheToolContext {
  const deps: FicheToolDependencies = {
    fiches: pgFicheToolRepository(pool),
    sessions: pgChatSearchSessionRepository(pool),
  };
  return {
    organizationId: org,
    chatLinkId: link,
    conversationId: CONVERSATION,
    config: CONFIG,
    fiches: [FICHE],
    deps,
  };
}

beforeAll(async () => {
  pool = await setupDb();
  org = await makeOrganization(pool, "Org expiration");
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chat_links (organization_id, token_hash, type, label)
     VALUES ($1, $2, 'standard', 'chatbot-expiration') RETURNING id`,
    [org, `hash-expiration-${org}`],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("Échec de création du lien");
  link = row.id;
  await pool.query(
    `INSERT INTO conversations (id, organization_id, link_id, visitor_nom)
     VALUES ($1, $2, $3, 'Test')`,
    [CONVERSATION, org, link],
  );
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_search_sessions");
  await pool.query("DELETE FROM fiches");
});

afterAll(async () => {
  await pool?.end();
});

describe("expiration des sessions de recherche (E014)", () => {
  it("refuse continue_search après expiration et impose une nouvelle recherche", async () => {
    for (let index = 0; index < 3; index += 1) {
      await pgFicheRepository(pool).create(org, {
        conversationId: null,
        prospectId: null,
        createdBy: null,
        definition: DEFINITION,
        data: { nom: `Fournisseur ${index}` },
        chatLinkIds: [link],
        qualificationStatusKey: "publie",
      });
    }

    const first = (await executeFicheTool(context(), "search_fiches", {
      limit: 2,
    })) as FicheSearchToolResult;
    expect(first.total).toBe(3);

    await pool.query(
      `UPDATE chat_search_sessions
          SET expires_at = now() - INTERVAL '1 minute'
        WHERE conversation_id = $1`,
      [CONVERSATION],
    );

    await expect(executeFicheTool(context(), "continue_search", { limit: 2 })).rejects.toThrow(
      /Aucune recherche active : relancez search_fiches/,
    );

    const again = (await executeFicheTool(context(), "search_fiches", {
      limit: 2,
    })) as FicheSearchToolResult;
    expect(again.total).toBe(3);
    expect(again.page).toEqual({ limit: 2, offset: 0 });

    const continued = (await executeFicheTool(context(), "continue_search", {
      limit: 2,
    })) as FicheSearchToolResult;
    expect(continued.page).toEqual({ limit: 2, offset: 2 });
    expect(continued.hasMore).toBe(false);
  });
});
