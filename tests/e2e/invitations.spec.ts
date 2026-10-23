import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

/**
 * Scénarios E2E des invitations par lien.
 * Prérequis : `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (super-admin seedé) et
 * une base jetable migrée. Sans ces variables, les tests sont ignorés.
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const enabled = ADMIN_EMAIL !== undefined && ADMIN_PASSWORD !== undefined;

test.skip(!enabled, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD non fournis");

test.describe.configure({ mode: "serial" });

async function login(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/login", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
}

async function loginPage(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL ?? "");
  await page.getByLabel("Mot de passe").fill(ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(
    (current) => current.pathname === "/" || current.pathname === "/organisations",
  );
}

test("admin crée un lien, l'invité accepte et arrive sur le dashboard", async ({
  page,
  request,
}) => {
  await login(request);
  const email = `invite-${Date.now()}@example.com`;
  const organizations = await request.get("/api/organizations");
  const { organizations: list } = (await organizations.json()) as {
    organizations: { id: string }[];
  };
  const target = list[0];
  expect(target).toBeTruthy();
  const created = await request.post("/api/invitations", {
    data: { organizationId: target?.id, role: "lecteur" },
  });
  expect(created.status()).toBe(201);
  const { invitation } = (await created.json()) as {
    invitation: { id: string; url: string | null; organizationId: string | null };
  };
  expect(invitation.organizationId).not.toBeNull();
  expect(invitation.url).toBeTruthy();
  const url = invitation.url as string;
  const path = new URL(url).pathname;

  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Rejoindre le dashboard" })).toBeVisible();
  await page.locator('input[name="name"]').fill("Invité E2E");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Invite-Password-123");
  await page.locator('input[name="confirmation"]').fill("Invite-Password-123");
  await page.getByRole("button", { name: "Rejoindre l'organisation" }).click();
  await page.waitForURL((current) => current.pathname === "/");
  await expect(page.getByRole("link", { name: "ONIR CMS — tableau de bord" })).toBeVisible();

  // Le lien est à usage unique : sa réouverture ne propose plus le formulaire.
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Invitation déjà utilisée" })).toBeVisible();
});

test("la création affiche immédiatement le statut et les actions du lien", async ({ page }) => {
  await loginPage(page);
  await page.goto("/invitations");
  await page.getByRole("button", { name: "Créer le lien" }).click();

  const row = page.locator("tbody tr").first();
  await expect(row.getByText("En attente")).toBeVisible();
  await expect(row.getByRole("button", { name: "Copier le lien" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Révoquer" })).toBeVisible();
});

test("page sans organisation : un compte rattaché est redirigé vers le dashboard", async ({
  page,
  request,
}) => {
  await login(request);
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL ?? "");
  await page.getByLabel("Mot de passe").fill(ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((current) => current.pathname === "/");
  await page.goto("/no-organization");
  await page.waitForURL((current) => current.pathname === "/");
  await expect(page.getByRole("link", { name: "ONIR CMS — tableau de bord" })).toBeVisible();
});
