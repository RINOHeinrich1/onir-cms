import { cp, rm } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: ["src/infrastructure/db/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  tsconfig: "tsconfig.json",
  outfile: "dist/db-cli.mjs",
  logLevel: "info",
});

await rm("dist/migrations", { recursive: true, force: true });
await cp("src/infrastructure/db/migrations", "dist/migrations", { recursive: true });
