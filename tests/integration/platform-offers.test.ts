import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";
import { pgPlatformOfferRepository } from "@/infrastructure/db/platform-offer-repository";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let ownerOrg: string;
let userId: string;
let providerId: string;

beforeAll(async () => {
  pool = await setupDb();
  ownerOrg = await makeOrganization(pool, "Org offres");
  userId = await makeUser(pool, "offers@example.com", { superAdmin: true });
  const provider = await pool.query<{ id: string }>(
    `INSERT INTO ai_providers
       (organization_id, label, preset, dialect, base_url,
        api_key_ciphertext, api_key_iv, api_key_tag)
     VALUES ($1, 'Provider offres', 'custom', 'openai',
             'https://example.test/v1', 'c', 'i', 't')
     RETURNING id`,
    [ownerOrg],
  );
  providerId = provider.rows[0]?.id ?? "";
  await pool.query(
    `INSERT INTO ai_provider_models
       (organization_id, provider_id, model_id, label, source)
     VALUES ($1, $2, 'model-offer', 'Modèle offre', 'manual')`,
    [ownerOrg, providerId],
  );
});

afterAll(async () => {
  await pool.end();
});

function provisioning(): OrganizationProvisioning {
  return {
    maxChatbots: 3,
    maxTokens: 1000,
    tokenResetMode: "manual",
    tokenResetDays: null,
    allocations: [
      {
        target: { kind: "model", providerId, model: "model-offer" },
        maxTokens: 500,
      },
    ],
    defaults: [],
  };
}

describe("offres plateforme", () => {
  it("crée, liste, modifie et supprime une offre", async () => {
    const repo = pgPlatformOfferRepository(pool);
    const created = await repo.create({
      name: "Offre Essentiel",
      description: "Une offre test",
      provisioning: provisioning(),
      active: true,
      createdBy: userId,
    });
    expect(created.name).toBe("Offre Essentiel");
    expect((await repo.list()).map((offer) => offer.id)).toContain(created.id);

    const updated = await repo.update(created.id, {
      name: "Offre Essentiel+",
      active: false,
    });
    expect(updated).toMatchObject({ name: "Offre Essentiel+", active: false });
    expect((await repo.list()).map((offer) => offer.id)).not.toContain(created.id);
    expect((await repo.list(true)).map((offer) => offer.id)).toContain(created.id);
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });
});
