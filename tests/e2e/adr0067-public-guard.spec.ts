import { type APIRequestContext, expect, test } from "@playwright/test";
import {
  createChatbotFixture,
  type E2EFixture,
  linkPayload,
  searchToolPayload,
} from "./helpers/adr0067-fixtures";

/**
 * E009 — garde des liens publics (ADR-0067 §2.5 / §10) : `internal_filter`,
 * `all` et `scope=organization` sont refusés côté serveur, en création comme
 * en modification, sans écriture partielle.
 */
const enabled = process.env.E2E_DATABASE_URL !== undefined;

test.skip(!enabled, "E2E_DATABASE_URL non fourni (base jetable requise)");
test.describe.configure({ mode: "serial" });

let fixture: E2EFixture;

test.beforeAll(async () => {
  fixture = await createChatbotFixture();
});

test.afterAll(async () => {
  await fixture?.cleanup();
});

async function login(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/login", {
    data: { email: fixture.adminEmail, password: fixture.adminPassword },
  });
  expect(response.ok()).toBeTruthy();
}

test("refuse les politiques backoffice à la création d'un lien public", async ({ request }) => {
  await login(request);
  const cases = [
    { statusMode: "internal_filter" },
    { statusMode: "all" },
    { scope: "organization" },
  ];
  for (const overrides of cases) {
    const response = await request.post("/api/links", {
      data: linkPayload(`Interdit ${JSON.stringify(overrides)}`, searchToolPayload(overrides)),
    });
    expect(response.status()).toBe(422);
    const body = (await response.json()) as { error?: string };
    expect(body.error ?? "").toMatch(/interdit|refus/i);
  }
});

test("refuse les politiques backoffice à la modification et conserve la configuration", async ({
  request,
}) => {
  await login(request);
  const before = await request.get(`/api/links/${fixture.linkId}/config`);
  const beforeJson = (await before.json()) as { config: { searchTool: unknown } };

  for (const overrides of [
    { statusMode: "internal_filter" },
    { statusMode: "all" },
    { scope: "organization" },
  ]) {
    const response = await request.patch(`/api/links/${fixture.linkId}`, {
      data: { config: linkPayload("x", searchToolPayload(overrides)).config },
    });
    expect(response.status()).toBe(422);
  }

  const after = await request.get(`/api/links/${fixture.linkId}/config`);
  const afterJson = (await after.json()) as { config: { searchTool: unknown } };
  expect(afterJson.config.searchTool).toEqual(beforeJson.config.searchTool);
});

test("accepte une politique publique explicite", async ({ request }) => {
  await login(request);
  const response = await request.post("/api/links", {
    data: linkPayload("Public valide", searchToolPayload()),
  });
  expect(response.status()).toBe(201);
});
