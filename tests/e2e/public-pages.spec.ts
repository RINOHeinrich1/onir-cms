import { expect, test } from "@playwright/test";

test.describe("application publique", () => {
  test("la racine applicative renvoie vers la connexion sans session", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");
  });

  test("la documentation reste accessible sans session", async ({ page }) => {
    await page.goto("/documentation");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Documentation ONIR CMS");
  });
});
