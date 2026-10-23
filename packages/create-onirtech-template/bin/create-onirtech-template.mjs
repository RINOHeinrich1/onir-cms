#!/usr/bin/env node
// Générateur multi-stack : `create-onirtech-template <id> --stack vanilla|react|vue`
//
// Produit un projet **complet et auto-suffisant** (ADR-0024 §3, §11) :
// scaffold du stack, harness MOCK copié, CLI `onirtech-template` copiée (pack),
// scripts npm dev/test/build/validate/pack, manifeste cohérent (id/name/element).
// Le stack vanilla n'a **aucun build** : l'intégrité SRI de `src/index.js` est
// calculée ici, après substitution des jetons.
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STACKS = ["vanilla", "react", "vue"];
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, "..");

const USAGE = `Usage : create-onirtech-template <id> [--stack vanilla|react|vue]

Crée un projet template Onirtech dans ./<id>.

Options :
  --stack <nom>   Stack du projet : vanilla (défaut), react ou vue
  -h, --help      Affiche cette aide

Exemples :
  npx @onirtech/create-onirtech-template aurora --stack react
  npx @onirtech/create-onirtech-template decouverte
`;

/** Erreur utilisateur : message clair, code de sortie non nul. */
function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Analyse des arguments (options inconnues refusées, un seul identifiant). */
function parseArgs(argv) {
  let id;
  let stack = "vanilla";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--stack" || arg.startsWith("--stack=")) {
      const value = arg === "--stack" ? argv[index + 1] : arg.slice("--stack=".length);
      if (arg === "--stack") index += 1;
      if (value === undefined || value === "" || value.startsWith("-")) {
        fail("--stack requiert une valeur : vanilla, react ou vue");
      }
      stack = value;
      continue;
    }
    if (arg.startsWith("-")) fail(`option inconnue : ${arg}`);
    if (id !== undefined) fail(`argument inattendu : ${arg}`);
    id = arg;
  }
  return { help: false, id, stack };
}

/** `demo-chat` → `Demo Chat`. */
function humanize(id) {
  return id
    .split("-")
    .filter((part) => part !== "")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/** Liste récursivement les fichiers d'un dossier. */
async function walk(root) {
  const out = [];
  for (const entry of await readdir(root)) {
    const full = join(root, entry);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Remplace les jetons communs dans tous les fichiers texte du scaffold. */
async function substitute(root, values) {
  for (const file of await walk(root)) {
    const source = await readFile(file, "utf8");
    let next = source;
    for (const [token, value] of Object.entries(values)) next = next.replaceAll(token, value);
    if (next !== source) await writeFile(file, next, "utf8");
  }
}

const { help, id, stack } = parseArgs(process.argv.slice(2));

if (help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
if (id === undefined) fail(`identifiant requis.\n\n${USAGE}`);
if (!ID_PATTERN.test(id)) fail(`identifiant invalide « ${id} » : attendu ^[a-z][a-z0-9-]*$`);
if (!STACKS.includes(stack)) {
  fail(`stack inconnu « ${stack} » (attendu : vanilla, react ou vue)`);
}

const element = `onirtech-template-${id}`;
const name = humanize(id);
const dest = resolve(process.cwd(), id);

// Refus d'écraser un dossier cible non vide (aucune perte silencieuse).
try {
  const info = await stat(dest);
  if (!info.isDirectory()) fail(`la cible existe et n'est pas un dossier : ${dest}`);
  if ((await readdir(dest)).length > 0) fail(`le dossier cible n'est pas vide : ${dest}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(dest, { recursive: true });

// 1. Scaffold du stack (copie entrée par entrée : fusion dans le dossier vide).
const scaffoldDir = join(kitRoot, "scaffold", stack);
for (const entry of await readdir(scaffoldDir)) {
  await cp(join(scaffoldDir, entry), join(dest, entry), { recursive: true });
}

// 2. Harness MOCK copié (développement 100 % hors-ligne).
const harnessDir = join(dest, "harness");
await mkdir(harnessDir, { recursive: true });
await cp(join(kitRoot, "harness", "host.mjs"), join(harnessDir, "host.mjs"));

// 3. CLI d'empaquetage copiée (auto-suffisance hors monorepo ; dépend de `fflate`).
const toolsDir = join(dest, "tools");
await mkdir(toolsDir, { recursive: true });
const cliDest = join(toolsDir, "onirtech-template.mjs");
await cp(join(kitRoot, "tools", "onirtech-template.mjs"), cliDest);
await chmod(cliDest, 0o755);

// 4. React/Vue : orchestrateur `dev` (harness + build watch).
if (stack !== "vanilla") {
  const devDest = join(toolsDir, "dev.mjs");
  await cp(join(kitRoot, "scaffold", "common", "tools", "dev.mjs"), devDest);
  await chmod(devDest, 0o755);
}

// 5. Substitution des jetons communs (id / name / element).
await substitute(dest, {
  __ID__: id,
  __NAME__: name,
  __ELEMENT__: element,
});

// 6. Manifeste : complète l'intégrité.
const MANIFEST = "onirtech.template.json";
if (stack === "vanilla") {
  // Pas de build : SRI calculé sur l'entrée **après** substitution.
  const manifestPath = join(dest, MANIFEST);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.id = id;
  manifest.name = name;
  manifest.ui.element = element;
  const entry = await readFile(join(dest, manifest.ui.entry.replace(/^\.\//, "")));
  manifest.ui.integrity = `sha256-${createHash("sha256").update(entry).digest("base64")}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
} else {
  // React/Vue : `manifest.ts` est la source ; le build Vite émet le JSON + SRI.
  const manifestPath = join(dest, "src", "manifest.ts");
  const manifest = await readFile(manifestPath, "utf8");
  if (!manifest.includes(`id: "${id}"`) || !manifest.includes(`element: "${element}"`)) {
    fail("scaffold incohérent : manifest.ts n'a pas reçu les jetons id/element");
  }
}

const devHint =
  stack === "vanilla"
    ? "npm run dev (harness MOCK) → npm test → npm run validate → npm run pack"
    : "npm run dev (harness + build watch) → npm test → npm run build → npm run validate → npm run pack";

console.log(`✓ Template « ${id} » créé (stack ${stack}) : ${dest}`);
console.log(`Élément : ${element}`);
console.log(`Étapes : npm install && ${devHint}`);
