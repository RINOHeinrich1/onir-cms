#!/usr/bin/env node
// Smoke test du générateur (CI) : génère les 3 stacks dans un dossier
// temporaire, vérifie les fichiers/scripts/manifestes, l'absence de jetons et
// empaquette réellement le stack vanilla. Aucun `npm install` (pas de réseau).
//
// Usage : node bin/smoke-create-template.mjs
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CREATE = join(here, "create-onirtech-template.mjs");
const CLI = join(here, "..", "tools", "onirtech-template.mjs");

const STACKS = ["vanilla", "react", "vue"];

/** Fichiers attendus par stack (au-delà des fichiers communs). */
const EXPECTED = {
  vanilla: [
    "package.json",
    "onirtech.template.json",
    "src/index.js",
    "src/ui.js",
    "src/styles.js",
    "tests/template.test.js",
    "vitest.config.mjs",
    ".gitignore",
    "harness/host.mjs",
    "tools/onirtech-template.mjs",
  ],
  react: [
    "package.json",
    "src/manifest.ts",
    "src/index.js",
    "src/Aurora.jsx",
    "src/styles.css",
    "vite.config.ts",
    "tests/template.test.jsx",
    "vitest.config.mjs",
    ".gitignore",
    "harness/host.mjs",
    "tools/onirtech-template.mjs",
    "tools/dev.mjs",
  ],
  vue: [
    "package.json",
    "src/manifest.ts",
    "src/index.js",
    "src/Aurora.vue",
    "src/styles.css",
    "vite.config.ts",
    "tests/template.test.js",
    "vitest.config.mjs",
    ".gitignore",
    "harness/host.mjs",
    "tools/onirtech-template.mjs",
    "tools/dev.mjs",
  ],
};

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

/** Exécute une commande, en remontant la sortie en cas d'échec. */
function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    errors.push(
      `${command} ${args.join(" ")} a échoué (code ${error.status})\n${output}`,
    );
    return null;
  }
}

/** Liste récursivement les fichiers (sans node_modules ni release). */
async function walk(root) {
  const out = [];
  for (const entry of await readdir(root)) {
    if (entry === "node_modules" || entry === "release" || entry === ".git") continue;
    const full = join(root, entry);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Texte suspect : un jeton `__TOKEN__` non substitué. */
const TOKEN = /\b__[A-Z][A-Z0-9_]*__\b/;

const tmp = await mkdtemp(join(tmpdir(), "onirtech-smoke-"));

try {
  for (const stack of STACKS) {
    const id = `demo-${stack}`;
    const dir = join(tmp, id);

    run(process.execPath, [CREATE, id, "--stack", stack], tmp);
    if (!existsSync(dir)) {
      errors.push(`${stack} : dossier non créé (${dir})`);
      continue;
    }

    // 1. Fichiers attendus.
    for (const file of EXPECTED[stack]) {
      check(existsSync(join(dir, file)), `${stack} : fichier manquant ${file}`);
    }

    // 2. Aucun jeton résiduel.
    for (const file of await walk(dir)) {
      const source = await readFile(file, "utf8");
      const match = source.match(TOKEN);
      if (match) errors.push(`${stack} : jeton ${match[0]} dans ${file}`);
    }

    // 3. package.json : nom + scripts conformes au stack.
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    check(pkg.name === id, `${stack} : package.name ≠ ${id}`);
    for (const script of ["dev", "test", "validate", "pack"]) {
      check(typeof pkg.scripts?.[script] === "string", `${stack} : script ${script} absent`);
    }
    if (stack === "vanilla") {
      check(pkg.scripts?.build === undefined, "vanilla : un script build ne doit pas exister");
    } else {
      check(typeof pkg.scripts?.build === "string", `${stack} : script build absent`);
    }

    // 4. Manifeste : id / element / cohérence.
    if (stack === "vanilla") {
      const manifest = JSON.parse(await readFile(join(dir, "onirtech.template.json"), "utf8"));
      check(manifest.id === id, `vanilla : manifest.id ≠ ${id}`);
      check(
        manifest.ui?.element === `onirtech-template-${id}`,
        "vanilla : ui.element incohérent",
      );
      check(
        typeof manifest.ui?.integrity === "string" && /^sha256-/.test(manifest.ui.integrity),
        "vanilla : intégrité SRI absente",
      );
      check(
        Array.isArray(manifest.params) && manifest.params.some((p) => p.key === "titre"),
        "vanilla : paramètre titre absent",
      );
      run(process.execPath, [CLI, "validate", id], tmp);
    } else {
      const manifest = await readFile(join(dir, "src", "manifest.ts"), "utf8");
      check(manifest.includes(`id: "${id}"`), `${stack} : manifest.ts id non substitué`);
      check(
        manifest.includes(`element: "onirtech-template-${id}"`),
        `${stack} : manifest.ts element non substitué`,
      );
      check(manifest.includes("defineManifest"), `${stack} : defineManifest absent`);
    }
  }

  // 5. Pack vanilla réel : archive + release.json.
  const archive = join(tmp, "demo-vanilla", "release", "demo-vanilla-1.0.0.onirtech-template");
  const packed = run(process.execPath, [CLI, "pack", "demo-vanilla"], tmp);
  if (packed !== null) {
    check(existsSync(archive), `vanilla : archive absente (${archive})`);
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.error(`✗ smoke create-onirtech-template : ${errors.length} erreur(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log("✓ smoke create-onirtech-template (3 stacks)");
