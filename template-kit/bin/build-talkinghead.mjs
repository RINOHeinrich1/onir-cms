#!/usr/bin/env node
// Reconstruit le bundle vendor « TalkingHead + three (isolé) » (ESM, minifié).
// Source : vendor-src/talkinghead.src.js → template-immersive/vendor/talkinghead.bundle.js.
// TalkingHead (MIT) embarque sa propre version de three (MIT) : aucun réseau au runtime.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url))); // template-kit/
const entry = join(root, "vendor-src", "talkinghead.src.js");
const outfile = join(root, "template-immersive", "vendor", "talkinghead.bundle.js");

// `three/addons/…` → `node_modules/three/examples/jsm/…` (comme le fait l'importmap).
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
console.log(`✓ vendor talkinghead → ${outfile}`);
