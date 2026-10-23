import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { sealAiKey } from "@/lib/ai-crypto";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgA: string;
let orgB: string;
const ORIGINAL_KEY = process.env.AI_PROVIDER_KEY;

beforeAll(async () => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
  pool = await setupDb();
  orgA = await makeOrganization(pool, "Org IA A");
  orgB = await makeOrganization(pool, "Org IA B");
});

beforeEach(async () => {
  await pool.query("DELETE FROM organization_ai_settings");
  await pool.query("DELETE FROM chat_links");
  await pool.query("DELETE FROM ai_providers");
});

afterAll(async () => {
  await pool.end();
  if (ORIGINAL_KEY === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL_KEY;
});

function input(label: string) {
  const sealed = sealAiKey(`sk-${label}-1234`);
  return {
    label,
    preset: "openai" as const,
    dialect: "openai" as const,
    baseUrl: "https://api.openai.com/v1",
    sealedKey: sealed,
    apiKeyHint: sealed.hint,
    defaultModel: "gpt-4o-mini",
    createdBy: null,
  };
}

describe("ai_providers — persistance et isolation", () => {
  it("crée, lit et liste par organisation", async () => {
    const repo = pgAiProviderRepository(pool);
    const a = await repo.create(orgA, input("OpenAI A"));
    const b = await repo.create(orgB, input("OpenAI B"));

    expect((await repo.list(orgA)).map((p) => p.id)).toEqual([a.id]);
    expect((await repo.list(orgB)).map((p) => p.id)).toEqual([b.id]);
    expect(await repo.findById(orgA, b.id)).toBeNull();
    expect((await repo.getSealedKey(orgA, a.id))?.ciphertext).toBeTruthy();
  });

  it("refuse un libellé dupliqué dans la même organisation", async () => {
    const repo = pgAiProviderRepository(pool);
    await repo.create(orgA, input("Doublon"));
    await expect(repo.create(orgA, input("doublon"))).rejects.toMatchObject({ code: "23505" });
    await expect(repo.create(orgB, input("doublon"))).resolves.toBeTruthy();
  });

  it("archive sans supprimer et filtre par défaut", async () => {
    const repo = pgAiProviderRepository(pool);
    const provider = await repo.create(orgA, input("Archive"));
    const archived = await repo.archive(orgA, provider.id);
    expect(archived?.archivedAt).not.toBeNull();
    expect(await repo.list(orgA)).toHaveLength(0);
    expect(await repo.list(orgA, { includeArchived: true })).toHaveLength(1);
  });

  it("mémorise le dernier test", async () => {
    const repo = pgAiProviderRepository(pool);
    const provider = await repo.create(orgA, input("Test"));
    await repo.setLastTest(orgA, provider.id, {
      ok: true,
      latencyMs: 42,
      modelsCount: 3,
      error: "",
    });
    const updated = await repo.findById(orgA, provider.id);
    expect(updated?.lastTestOk).toBe(true);
    expect(updated?.lastTestError).toBe("");
  });

  it("gère le défaut d'organisation avec contrainte composite", async () => {
    const repo = pgAiProviderRepository(pool);
    const a = await repo.create(orgA, input("Défaut A"));
    const b = await repo.create(orgB, input("Défaut B"));
    const settings = await repo.setOrganizationDefault(orgA, {
      providerId: a.id,
      model: "gpt-4o-mini",
      updatedBy: null,
    });
    expect(settings?.defaultProviderId).toBe(a.id);
    await expect(
      repo.setOrganizationDefault(orgA, {
        providerId: b.id,
        model: "gpt-4o-mini",
        updatedBy: null,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("compte les liens et protège la FK", async () => {
    const repo = pgAiProviderRepository(pool);
    const provider = await repo.create(orgA, input("Liens"));
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO chat_links (organization_id, token_hash, type, label)
       VALUES ($1, 'hash-ai-test', 'standard', 'Lien IA') RETURNING id`,
      [orgA],
    );
    const linkId = rows[0]?.id;
    expect(linkId).toBeTruthy();
    await pool.query("UPDATE chat_links SET ai_provider_id = $1, ai_model = $2 WHERE id = $3", [
      provider.id,
      "gpt-4o-mini",
      linkId,
    ]);
    expect(await repo.countLinksUsing(orgA, provider.id)).toBe(1);
    await expect(repo.archive(orgA, provider.id)).resolves.toBeTruthy();
    await expect(
      pool.query("DELETE FROM ai_providers WHERE id = $1", [provider.id]),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
