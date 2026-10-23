/**
 * Build du SDK (ADR-0024 §11) : bundles ESM minifiés via esbuild, puis
 * déclarations `.d.ts` via `tsc`.
 *
 * `ENTRIES` est étendu par les plans adaptateurs (P2 React, P3 Vue, P4 testing,
 * P5 vite) — le cœur n'en déclare qu'un.
 *
 * `src/vite` cible Node : `vite` reste externe (peer optionnelle) et les
 * modules `node:*` ne sont jamais embarqués dans le bundle.
 */
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ENTRIES = [
  { in: "src/index.ts", out: "dist/index.js", platform: "browser" },
  { in: "src/react/index.ts", out: "dist/react.js", platform: "browser" },
  { in: "src/vue/index.ts", out: "dist/vue.js", platform: "browser" },
  { in: "src/testing/index.ts", out: "dist/testing.js", platform: "browser" },
  { in: "src/vite/index.ts", out: "dist/vite.js", platform: "node" },
];

const EXTERNAL = ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "vue", "vite"];

await rm("dist", { recursive: true, force: true });

for (const entry of ENTRIES) {
  await build({
    entryPoints: [entry.in],
    outfile: entry.out,
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: entry.platform,
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    external: EXTERNAL,
  });
  console.log(`built ${entry.out}`);
}

const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], { stdio: "inherit" });
console.log("declarations written to dist/");
