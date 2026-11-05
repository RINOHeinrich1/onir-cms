import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { createChatbotFixture, type E2EFixture, e2eDatabaseUrl } from "./helpers/adr0067-fixtures";

/**
 * E008 — configuration admin de l'outil de recherche (ADR-0067 §2.5 / §4.9).
 * Prérequis : `E2E_DATABASE_URL` (base jetable migrée) + `E2E_BASE_URL`.
 */
const enabled = process.env.E2E_DATABASE_URL !== undefined;

test.skip(!enabled, "E2E_DATABASE_URL non fourni (base jetable requise)");
test.describe.configure({ mode: "serial" });

let fixture: E2EFixture;
let pool: Pool;

test.beforeAll(async () => {
  fixture = await createChatbotFixture();
  pool = new Pool({ connectionString: e2eDatabaseUrl(), max: 2 });
});

test.afterAll(async () => {
  await pool?.end();
  await fixture?.cleanup();
});

async function openEditor(page: import("@playwright/test").Page): Promise<void> {
  // Connexion via l'API puis navigation : évite la course d'hydratation du
  // formulaire, qui rend le clic intermittent en exécution groupée.
  const response = await page.request.post("/api/auth/login", {
    data: { email: fixture.adminEmail, password: fixture.adminPassword },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/liens");

  const card = page.locator("article", { hasText: fixture.label }).first();
  await expect(card).toBeVisible();
  await card.locator("details.action-menu").evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await card.getByRole("button", { name: "Modifier" }).click({ force: true });
  await expect(page.getByRole("dialog", { name: "Modifier le chatbot" })).toBeVisible();
}

test("l'éditeur expose les politiques versionnées avec les gardes publiques", async ({ page }) => {
  await openEditor(page);
  const group = page.getByRole("group", { name: "Outil de recherche" });
  await expect(group).toBeVisible();

  const statusMode = group.getByLabel("Mode de statut");
  await expect(statusMode).toHaveValue("hidden_fixed");
  await expect(statusMode.locator('option[value="internal_filter"]')).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(statusMode.locator('option[value="all"]')).toHaveAttribute("disabled", "");

  const scope = group.getByLabel("Portée de la recherche");
  await expect(scope).toHaveValue("chat_link");
  await expect(scope.locator('option[value="organization"]')).toHaveAttribute("disabled", "");

  const sortMode = group.getByLabel("Tri des résultats");
  await expect(sortMode.locator('option[value="relevance"]')).toHaveAttribute("disabled", "");

  // Statuts non archivés uniquement (le statut archivé ne doit pas être proposé).
  await expect(group.getByRole("checkbox", { name: /Publié/ })).toBeVisible();
  await expect(group.getByRole("checkbox", { name: /À qualifier/ })).toBeVisible();
  await expect(group.getByRole("checkbox", { name: /Archivé/ })).toHaveCount(0);

  // Le type de fiche du snapshot est sélectionnable.
  await expect(group.getByRole("checkbox", { name: /Fournisseur/ })).toBeVisible();
});

test("saisit, enregistre et recharge searchTool sans perte", async ({ page }) => {
  await openEditor(page);
  const group = page.getByRole("group", { name: "Outil de recherche" });

  const supplier = group.getByRole("checkbox", { name: /Fournisseur/ });
  if (!(await supplier.isChecked())) await supplier.check();
  const published = group.getByRole("checkbox", { name: /Publié/ });
  if (!(await published.isChecked())) await published.check();
  await group.getByLabel("Tri des résultats").selectOption("created_at");

  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByRole("dialog", { name: "Modifier le chatbot" })).toHaveCount(0);

  const stored = await pool.query<{ search_tool: Record<string, unknown> }>(
    `SELECT search_tool FROM chatbot_configs
      WHERE chat_link_id = $1 ORDER BY version DESC LIMIT 1`,
    [fixture.linkId],
  );
  expect(stored.rows[0]?.search_tool).toEqual({
    ficheTypes: ["fournisseur"],
    statusMode: "hidden_fixed",
    fixedStatusKeys: ["publie"],
    sortMode: "created_at",
    scope: "chat_link",
  });

  // Rechargement : les valeurs reviennent du serveur.
  await openEditor(page);
  const reloaded = page.getByRole("group", { name: "Outil de recherche" });
  await expect(reloaded.getByLabel("Tri des résultats")).toHaveValue("created_at");
  await expect(reloaded.getByRole("checkbox", { name: /Publié/ })).toBeChecked();
  await expect(reloaded.getByRole("checkbox", { name: /Fournisseur/ })).toBeChecked();
});
