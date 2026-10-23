#!/usr/bin/env node
// Bundle vendor unifié (three + addons + TalkingHead) — une seule instance three.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url))); // template-kit/
const entry = join(root, "vendor-src", "immersive.src.js");
const outfile = join(root, "template-immersive", "vendor", "immersive.js");

const addonsPlugin = {
  name: "three-addons",
  setup(b) {
    b.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: join(root, "node_modules", "three", "examples", "jsm", args.path.replace(/^three\/addons\//, "")),
    }));
  },
};

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  minify: true,
  legalComments: "none",
  target: "es2020",
  outfile,
  plugins: [addonsPlugin],
  logLevel: "info",
});
console.log(`✓ vendor immersive → ${outfile}`);
