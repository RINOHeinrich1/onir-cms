#!/usr/bin/env node
// Reconstruit le bundle vendor « three + loaders » (ESM, minifié) consommé par les
// templates. Source : vendor-src/three-loaders.src.js → template-immersive/vendor/three-loaders.js.
// `three` (MIT) est embarqué ; aucun accès réseau au runtime.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url))); // template-kit/
const entry = join(root, "vendor-src", "three-loaders.src.js");
const outfile = join(root, "template-immersive", "vendor", "three-loaders.js");

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  minify: true,
  legalComments: "none",
  target: "es2020",
  outfile,
  logLevel: "info",
});
console.log(`✓ vendor three-loaders → ${outfile}`);
