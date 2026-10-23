import { expect, test } from "@playwright/test";

test.describe("pages publiques", () => {
  test("la landing est accessible sans session", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Des conversations qui deviennent des prospects",
    );
    await expect(page.getByRole("link", { name: "Voir les plugins" }).first()).toBeVisible();
  });

  test("la marketplace expose deux plugins gratuits téléchargeables", async ({ page, request }) => {
    await page.goto("/plugins");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plugins gratuits.");
    await expect(page.locator(".plugin-card")).toHaveCount(2);
    await expect(page.getByText("Gratuit", { exact: true })).toHaveCount(2);

    const immersive = await request.get("/plugins/immersive-4.44.0.onirtech-template");
    expect(immersive.ok()).toBeTruthy();

    const starter = await request.get("/plugins/starter-1.0.1.onirtech-template");
    expect(starter.ok()).toBeTruthy();
  });
});
