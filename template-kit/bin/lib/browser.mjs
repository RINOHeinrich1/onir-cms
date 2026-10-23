// Bootstrap navigateur partagé par les scripts de contrôle du kit
// (`bin/test-render.mjs`, `bin/test-immersive-flow.mjs`).
//
// Aucune dépendance runtime du template : ce module n'est utilisé que par les
// scripts Node de développement/CI. Il centralise la découverte de Chromium,
// le chargement de `playwright-core` et le démarrage du harnais MOCK.

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Racine du kit (`template-kit/`). */
export const kitRoot = resolve(__dirname, "..", "..");

/** Cherche un Chromium utilisable (CHROME_PATH, cache Playwright, système). */
export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(process.env.HOME || "", ".cache/ms-playwright"),
  ].filter((root) => typeof root === "string" && root.length > 0);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse();
    for (const d of dirs) {
      const p = join(root, d, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Charge `playwright-core` (dépendance de dev du monorepo), ou `null`. */
export function loadPlaywright() {
  for (const from of [import.meta.url, join(kitRoot, "package.json"), join(process.cwd(), "package.json")]) {
    try {
      const require = createRequire(from);
      return require("playwright-core");
    } catch {
      /* essai suivant */
    }
  }
  return null;
}

/** Arguments Chromium communs (rendu logiciel reproductible en CI). */
export const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-dev-shm-usage",
];

/** Lance Chromium avec les mêmes options que `test-render`. */
export function launchChromium(playwright, chrome, extra = {}) {
  return playwright.chromium.launch({
    executablePath: chrome,
    args: CHROMIUM_ARGS,
    ...extra,
  });
}

/**
 * Démarre le harnais MOCK sur `port` et résout quand il écoute.
 * `dir` est le dossier du template à servir.
 */
export function startHarness({ dir, port, timeout = 15000, cwd = kitRoot } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [join(kitRoot, "harness", "host.mjs"), "--dir", dir, "--port", String(port)],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error("harnais non démarré (timeout)"));
      }
    }, timeout);
    child.stdout.on("data", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        setTimeout(() => resolvePromise(child), 400);
      }
    });
    child.stderr.on("data", () => {});
    child.on("exit", (code) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error(`harnais arrêté (code ${code})`));
      }
    });
  });
}
