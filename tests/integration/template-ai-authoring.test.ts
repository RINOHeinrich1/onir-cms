import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { buildDefaultRenderTemplate, buildDefaultSystemPrompt } from "@/domain/template-defaults";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgTemplateAiRepository } from "@/infrastructure/db/template-ai-repository";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgId: string;

const FIELDS = [{ name: "budget", label: "Budget", type: "text" as const, required: false }];
const DEFINITION: TemplateDefinition = {
  key: "ai-modele",
  label: "AI modèle",
  description: "Test",
  systemPrompt: buildDefaultSystemPrompt({
    role: "assistant",
    objective: "objectif",
    tone: "direct et concis",
    guardrails: ["professional"],
    fields: FIELDS,
  }),
  fields: FIELDS,
  renderTemplate: buildDefaultRenderTemplate("AI modèle", FIELDS),
};

beforeAll(async () => {
  pool = await setupDb();
  orgId = await makeOrganization(pool, "AI org");
});

afterAll(async () => {
  await pool.end();
});

describe("template-ai authoring (ADR-0038)", () => {
  it("crée le modèle et scope les connaissances IA sur sa clé", async () => {
    const repo = pgTemplateAiRepository(pool);
    const result = await repo.apply({
      organizationId: orgId,
      templateKey: null,
      definition: DEFINITION,
      knowledge: [
        { titre: "Zone", contenu: "Lyon" },
        { titre: "Contact", contenu: "contact@example.com" },
      ],
      mergePolicy: "append",
      generationId: "00000000-0000-4000-8000-000000000001",
      createdBy: null,
    });
    expect(result.version.version).toBe(1);
    expect(result.knowledge.created).toBe(2);
    const rows = await pool.query(
      "SELECT titre, origin, source_template_key, template_keys FROM base_connaissances WHERE organization_id = $1 ORDER BY titre",
      [orgId],
    );
    expect(rows.rows).toEqual([
      {
        titre: "Contact",
        origin: "ai",
        source_template_key: "ai-modele",
        template_keys: ["ai-modele"],
      },
      {
        titre: "Zone",
        origin: "ai",
        source_template_key: "ai-modele",
        template_keys: ["ai-modele"],
      },
    ]);
    expect(await pgConnaissanceRepository(pool).countAiByTemplate(orgId, "ai-modele")).toBe(2);
  });

  it("remplace uniquement les connaissances IA et conserve le manuel", async () => {
    const repo = pgTemplateAiRepository(pool);
    const connaissances = pgConnaissanceRepository(pool);
    await connaissances.create(orgId, {
      titre: "Manuel",
      contenu: "À conserver",
      chatLinkIds: [],
      legacyTemplateKeys: ["ai-modele"],
      createdBy: null,
    });

    const result = await repo.apply({
      organizationId: orgId,
      templateKey: "ai-modele",
      definition: DEFINITION,
      knowledge: [{ titre: "Nouvelle zone", contenu: "Rhône" }],
      mergePolicy: "replace",
      generationId: "00000000-0000-4000-8000-000000000002",
      createdBy: null,
    });
    expect(result.version.version).toBe(2);
    expect(result.knowledge.replaced).toBe(2);
    expect(result.knowledge.created).toBe(1);
    const rows = await pool.query<{ titre: string; origin: string }>(
      "SELECT titre, origin FROM base_connaissances WHERE organization_id = $1 ORDER BY titre",
      [orgId],
    );
    expect(rows.rows).toEqual([
      { titre: "Manuel", origin: "manual" },
      { titre: "Nouvelle zone", origin: "ai" },
    ]);
  });
});
