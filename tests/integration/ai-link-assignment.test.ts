import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreateChatLinkInput } from "@/application/ports/chat-link-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { sealAiKey } from "@/lib/ai-crypto";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgA: string;
let orgB: string;
const ORIGINAL_KEY = process.env.AI_PROVIDER_KEY;

beforeAll(async () => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
  pool = await setupDb();
  orgA = await makeOrganization(pool, "Org lien IA A");
  orgB = await makeOrganization(pool, "Org lien IA B");
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_links");
  await pool.query("DELETE FROM ai_provider_models");
  await pool.query("DELETE FROM organization_ai_settings");
  await pool.query("DELETE FROM ai_providers");
});

afterAll(async () => {
  await pool.end();
  if (ORIGINAL_KEY === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL_KEY;
});

function linkInput(overrides: Partial<CreateChatLinkInput> = {}): CreateChatLinkInput {
  return {
    tokenHash: `hash-${Math.random().toString(16).slice(2)}`,
    tokenEnc: "enc",
    label: "Lien IA",
    type: "standard",
    identificationMode: "contact",
    prospectId: null,
    createdBy: null,
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
    ...overrides,
  };
}

async function provider(org: string, label: string) {
  const sealed = sealAiKey("sk-test-1234");
  return pgAiProviderRepository(pool).create(org, {
    label,
    preset: "openai",
    dialect: "openai",
    baseUrl: "https://api.openai.com/v1",
    sealedKey: sealed,
    apiKeyHint: sealed.hint,
    defaultModel: null,
    createdBy: null,
  });
}

describe("chat_links — affectation IA", () => {
  it("écrit et relit le couple fournisseur+modèle", async () => {
    const repo = pgChatLinkRepository(pool);
    const p = await provider(orgA, "Provider A");
    const created = await repo.create(
      orgA,
      linkInput({ aiProviderId: p.id, aiModel: "gpt-4o-mini" }),
    );
    expect(created.aiProviderId).toBe(p.id);
    expect(created.aiModel).toBe("gpt-4o-mini");
    const fetched = await repo.findById(orgA, created.id);
    expect(fetched?.aiProviderId).toBe(p.id);
    expect(fetched?.aiModel).toBe("gpt-4o-mini");
  });

  it("revient à l'héritage via updateDetails (null/null)", async () => {
    const repo = pgChatLinkRepository(pool);
    const p = await provider(orgA, "Provider A");
    const created = await repo.create(
      orgA,
      linkInput({ aiProviderId: p.id, aiModel: "gpt-4o-mini" }),
    );
    const updated = await repo.updateDetails(orgA, created.id, {
      label: created.label,
      identificationMode: "contact",
      expiresAt: null,
      sources: created.sources,
      confidentialiteId: null,
      userStateEnabled: false,
      visualTemplateId: null,
      visualTemplateVersion: null,
      visualTemplateConfig: {},
      visualTemplateParams: {},
      aiProviderId: null,
      aiModel: null,
    });
    expect(updated?.aiProviderId).toBeNull();
    expect(updated?.aiModel).toBeNull();
  });

  it("refuse une paire incomplète au niveau SQL", async () => {
    const repo = pgChatLinkRepository(pool);
    const p = await provider(orgA, "Provider A");
    await expect(
      pool.query(
        `INSERT INTO chat_links (organization_id, token_hash, type, label, ai_provider_id)
         VALUES ($1, 'hash-incomplete', 'standard', 'x', $2)`,
        [orgA, p.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    // Le repository ne peut pas produire cette paire : il écrit les deux colonnes.
    await expect(
      repo.create(orgA, linkInput({ aiProviderId: p.id, aiModel: null })),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("refuse un fournisseur d'une autre organisation (FK composite)", async () => {
    const repo = pgChatLinkRepository(pool);
    const pB = await provider(orgB, "Provider B");
    await expect(
      repo.create(orgA, linkInput({ aiProviderId: pB.id, aiModel: "gpt-4o-mini" })),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
