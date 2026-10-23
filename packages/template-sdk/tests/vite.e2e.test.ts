/**
 * Test d'intégration P5 : lance un **vrai** `vite build` sur la fixture et
 * vérifie que `onirtech.template.json` est émis après le bundle, avec une
 * intégrité SRI calculée sur `dist/index.js` (ordre build → validate → pack).
 */
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeSri } from "../src/vite/manifest.js";

// `npm test --prefix packages/template-sdk` exécute vitest avec le cwd du paquet.
// (`import.meta.url` est réécrit par l'environnement happy-dom.)
const PACKAGE_DIR = process.cwd();
const FIXTURE_DIR = join(PACKAGE_DIR, "tests", "fixtures", "vite-project");
const VITE_BIN = join(PACKAGE_DIR, "node_modules", "vite", "bin", "vite.js");
const DIST_DIR = join(FIXTURE_DIR, "dist");
const BUNDLE = join(DIST_DIR, "index.js");
const MANIFEST = join(FIXTURE_DIR, "onirtech.template.json");
const ELEMENT = "onirtech-template-fixture";

async function cleanup(): Promise<void> {
  await rm(DIST_DIR, { recursive: true, force: true });
  await rm(MANIFEST, { force: true });
}

describe("vite build sur la fixture", () => {
  beforeAll(async () => {
    await cleanup();
    execFileSync(process.execPath, [VITE_BIN, "build", "--logLevel", "warn"], {
      cwd: FIXTURE_DIR,
      stdio: "pipe",
    });
  }, 120_000);

  afterAll(cleanup);

  it("émet onirtech.template.json avec ui.entry et ui.element attendus", async () => {
    const raw = await readFile(MANIFEST, "utf8");
    const manifest = JSON.parse(raw) as {
      schemaVersion: number;
      kind: string;
      compatibility: { hostProtocol: string };
      network: string[];
      ui: { mode: string; entry: string; element: string; integrity: string };
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.kind).toBe("template");
    expect(manifest.compatibility.hostProtocol).toBe("onirtech.template-host.v1");
    expect(manifest.network).toEqual([]);

    expect(manifest.ui.entry).toBe("./dist/index.js");
    expect(manifest.ui.element).toBe(ELEMENT);
    expect(manifest.ui.mode).toBe("web-component");
  });

  it("calcule l'intégrité SRI sur le bundle réellement produit", async () => {
    const [raw, bundle] = await Promise.all([readFile(MANIFEST, "utf8"), readFile(BUNDLE)]);
    const manifest = JSON.parse(raw) as { ui: { integrity: string } };

    expect(bundle.toString("utf8")).toContain(ELEMENT);
    expect(manifest.ui.integrity).toBe(computeSri(bundle));
    expect(manifest.ui.integrity).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
  });
});
