import { mkdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const outdir = path.resolve("dist/standalone-runtime");
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["src/standalone/public-runtime.tsx"],
  outdir,
  entryNames: "runtime",
  bundle: true,
  minify: true,
  sourcemap: false,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  alias: {
    "@": path.resolve("src"),
  },
  loader: {
    ".css": "css",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  logLevel: "info",
});
