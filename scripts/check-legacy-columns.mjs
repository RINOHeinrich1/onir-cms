#!/usr/bin/env node
/**
 * F021 — garde anti-réintroduction du legacy des fiches (ADR-0067 §3, étape 6).
 *
 * Échoue si le code applicatif réintroduit :
 *   - la constante `STATUTS_FICHE` / le type ou garde `StatutFiche` ;
 *   - un accès aux colonnes legacy `plateformes`, `contraintes_techno`,
 *     `lien_doc_spec`, `contraintesTechno`, `lienDocSpec` ;
 *   - un accès `fiches.statut` / `fiche.statut` / `row.statut` ;
 *   - les valeurs historiques `initier` / `reprendre` ;
 *   - une requête SQL ciblant la colonne `plateformes`.
 *
 * Périmètre : `src/`, `tests/`, `scripts/`, `.github/`.
 *
 * Exclusions volontaires (légitimes) :
 *   - `src/infrastructure/db/migrations/**` : historique immuable + 0082
 *     (seul fichier autorisé à nommer les colonnes legacy) ;
 *   - `docs/**`, `plans/**`, `reports/**` : documentation / rapports ;
 *   - `tests/integration/legacy-cleanup.test.ts` : preuve de la migration
 *     destructive (doit insérer et vérifier les colonnes legacy) ;
 *   - le présent script (il contient les motifs par nature).
 *
 * Les noms de champs de collecte (`name: "plateformes"`, `{{plateformes}}`)
 * restent autorisés : ce sont des clés de `fiches.data`, pas des colonnes SQL.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "tests", "scripts", ".github"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".yml", ".yaml"]);
const IGNORED_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", "coverage"]);
const IGNORED_FILES = new Set([
  "src/infrastructure/db/migrations",
  "tests/integration/legacy-cleanup.test.ts",
  "scripts/check-legacy-columns.mjs",
]);

const PATTERNS = [
  { label: "constante STATUTS_FICHE", regex: /\bSTATUTS_FICHE\b/ },
  { label: "type/garde StatutFiche", regex: /\b(?:isStatutFiche|StatutFiche)\b/ },
  { label: "accès colonne plateformes", regex: /(?:\.|->>?|\[\s*['"])plateformes\b/ },
  { label: "accès colonne contraintesTechno", regex: /(?:\.|->>?|\[\s*['"])contraintesTechno\b/ },
  { label: "accès colonne lienDocSpec", regex: /(?:\.|->>?|\[\s*['"])lienDocSpec\b/ },
  { label: "colonne SQL contraintes_techno", regex: /\bcontraintes_techno\b/ },
  { label: "colonne SQL lien_doc_spec", regex: /\blien_doc_spec\b/ },
  { label: "accès fiches.statut", regex: /\b(?:fiches|fiche|legacy)\.statut\b/ },
  { label: "valeur historique initier/reprendre", regex: /['"](?:initier|reprendre)['"]/ },
  {
    label: "requête SQL sur plateformes",
    regex: /\b(?:SELECT|INSERT|UPDATE|RETURNING)[^\n]*\bplateformes\b/i,
  },
];

function isIgnored(relativePath) {
  if (IGNORED_FILES.has(relativePath)) return true;
  return relativePath.startsWith("src/infrastructure/db/migrations/");
}

async function* walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const rel = relative(ROOT, path).split("\\").join("/");
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || isIgnored(rel)) continue;
      yield* walk(path);
    } else if (entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      if (!isIgnored(rel)) yield path;
    }
  }
}

async function main() {
  const violations = [];

  for (const directory of SCAN_DIRS) {
    for await (const file of walk(join(ROOT, directory))) {
      const content = await readFile(file, "utf8");
      const lines = content.split("\n");
      for (const [index, line] of lines.entries()) {
        for (const pattern of PATTERNS) {
          if (pattern.regex.test(line)) {
            violations.push({
              file: relative(ROOT, file).split("\\").join("/"),
              line: index + 1,
              label: pattern.label,
              excerpt: line.trim().slice(0, 160),
            });
          }
        }
      }
    }
  }

  if (violations.length === 0) {
    process.stdout.write(
      "check:legacy — OK : aucune référence legacy des fiches hors migration 0082/ADR.\n",
    );
    return;
  }

  process.stderr.write(`check:legacy — ${violations.length} référence(s) legacy détectée(s) :\n\n`);
  for (const violation of violations) {
    process.stderr.write(
      `  ${violation.file}:${violation.line} — ${violation.label}\n    ${violation.excerpt}\n`,
    );
  }
  process.stderr.write(
    "\nCes références sont interdites (ADR-0067 §3). Voir docs/migration-0067-nettoyage-legacy.md.\n",
  );
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`check:legacy — erreur interne : ${String(error)}\n`);
  process.exitCode = 1;
});
