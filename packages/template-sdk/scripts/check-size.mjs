/**
 * Garde-fou de budget (ADR-0024 §1) : le cœur doit rester < 5 Kio gzip.
 * Affiche aussi les autres bundles éventuels (sans échouer).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET_BYTES = 5120;
const distPath = (relative) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const CORE = distPath("dist/index.js");
const OTHER_BUNDLES = [
  "dist/react/index.js",
  "dist/vue/index.js",
  "dist/testing/index.js",
  "dist/vite/index.js",
].map((relative) => ({ label: relative, path: distPath(relative) }));

if (!existsSync(CORE)) {
  console.error(`${CORE} introuvable — lancez d'abord « npm run build ».`);
  process.exit(1);
}

const core = gzipSync(readFileSync(CORE)).length;
const status = core <= BUDGET_BYTES ? "<" : ">=";
console.log(`core ${core} B gzip (${status} ${BUDGET_BYTES})`);

for (const bundle of OTHER_BUNDLES) {
  if (!existsSync(bundle.path)) continue;
  const size = gzipSync(readFileSync(bundle.path)).length;
  console.log(`${bundle.label} ${size} B gzip (${statSync(bundle.path).size} B raw)`);
}

if (core > BUDGET_BYTES) {
  console.error(`Budget dépassé : cœur ${core} B gzip > ${BUDGET_BYTES} B.`);
  process.exit(1);
}
