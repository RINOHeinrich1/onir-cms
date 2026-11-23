import { mkdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const outdir = path.resolve("dist");
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ["scripts/standalone-worker-daemon.ts"],
  outfile: path.join(outdir, "standalone-worker-daemon.mjs"),
  bundle: true,
  minify: false,
  sourcemap: false,
  format: "esm",
  platform: "node",
  target: ["node22"],
  packages: "external",
  alias: { "@": path.resolve("src") },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  logLevel: "info",
});
