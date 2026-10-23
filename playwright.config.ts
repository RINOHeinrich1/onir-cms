import { defineConfig, devices } from "@playwright/test";

/**
 * Harnais E2E multitenancy (ADR-0025, A112/A113).
 * Requiert une base jetable et un serveur Next (démarré automatiquement si
 * `E2E_BASE_URL` n'est pas fourni). Les scénarios sont volontairement limités
 * à l'isolation (login, bascule, 404 croisé, page Organisations, lien public).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === "true" ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3008",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  ...(process.env.E2E_BASE_URL === undefined
    ? {
        webServer: {
          command: "npm run dev -- -p 3008",
          url: "http://127.0.0.1:3008/api/health",
          reuseExistingServer: true,
          timeout: 180_000,
        },
      }
    : {}),
});
