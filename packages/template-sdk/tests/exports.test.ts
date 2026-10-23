/**
 * Surface de distribution du paquet `@onirtech/template-sdk` (ADR-0024 §1, §2, §10).
 *
 * Verrouille ce qui est publié sur npm : les 5 sous-chemins (tree-shaking), les
 * artefacts `dist/` correspondants, zéro dépendance runtime, les `peerDependencies`
 * optionnelles, l'absence de `postMessage` (transport Web Component uniquement) et
 * l'absence de motif de secret dans les bundles.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type ExportTarget = { types?: string; import?: string };

type PackageJson = {
  name: string;
  version: string;
  sideEffects?: boolean;
  files?: string[];
  exports: Record<string, ExportTarget | string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

/**
 * Racine du paquet : `npm --prefix packages/template-sdk` et `vitest` y placent
 * le cwd. `import.meta.url` n'est pas exploitable ici (URL du serveur Vite).
 */
const PACKAGE_ROOT = process.cwd();
const DIST_DIR = join(PACKAGE_ROOT, "dist");

const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as PackageJson;

/** Sous-chemins publics d'API (`./package.json` est un méta-export). */
const API_SUBPATHS = [".", "./react", "./vue", "./testing", "./vite"] as const;

/** Tous les sous-chemins attendus dans `exports`. */
const ALL_SUBPATHS = [...API_SUBPATHS, "./package.json"] as const;

/** Bundles attendus dans `dist/` (un par sous-chemin d'API). */
const EXPECTED_BUNDLES = ["index.js", "react.js", "vue.js", "testing.js", "vite.js"] as const;

/** Motifs interdits dans les bundles : transport iframe et secrets. */
const FORBIDDEN_PATTERNS = [
  { label: "postMessage", pattern: /postMessage/ },
  { label: "token", pattern: /token/i },
  { label: "secret", pattern: /secret/i },
  { label: "password", pattern: /password/i },
] as const;

function exportTarget(subpath: string): ExportTarget {
  const target = pkg.exports[subpath];
  if (typeof target !== "object" || target === null) {
    throw new Error(`export « ${subpath} » absent ou non objet`);
  }
  return target;
}

/** Tous les bundles `.js` de `dist/` (récursif), triés. */
function bundleFiles(): string[] {
  return readdirSync(DIST_DIR, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith(".js"))
    .sort();
}

describe("surface de distribution du SDK", () => {
  it("déclare exactement les 5 sous-chemins d'API + ./package.json", () => {
    expect(pkg.name).toBe("@onirtech/template-sdk");
    expect(Object.keys(pkg.exports).sort()).toEqual([...ALL_SUBPATHS].sort());
    expect(API_SUBPATHS).toHaveLength(5);
  });

  it("chaque cible `types` / `import` pointe vers un artefact existant de dist/", () => {
    for (const subpath of API_SUBPATHS) {
      const target = exportTarget(subpath);

      expect(target.types, `${subpath} → types`).toBeDefined();
      expect(target.import, `${subpath} → import`).toBeDefined();
      expect(target.types?.startsWith("./dist/")).toBe(true);
      expect(target.import?.startsWith("./dist/")).toBe(true);
      expect(target.types?.endsWith(".d.ts")).toBe(true);
      expect(target.import?.endsWith(".js")).toBe(true);

      const typesPath = join(PACKAGE_ROOT, target.types as string);
      const importPath = join(PACKAGE_ROOT, target.import as string);
      expect(existsSync(typesPath), `${subpath} → ${target.types}`).toBe(true);
      expect(existsSync(importPath), `${subpath} → ${target.import}`).toBe(true);
      expect(statSync(importPath).size, `${subpath} doit être non vide`).toBeGreaterThan(0);
    }
  });

  it("est déclaré sans effet de bord et sans dépendance runtime", () => {
    expect(pkg.sideEffects).toBe(false);
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it("déclare react/react-dom/vue/vite en peerDependencies optionnelles uniquement", () => {
    const peers = pkg.peerDependencies ?? {};
    for (const peer of ["react", "react-dom", "vue", "vite"]) {
      expect(peers[peer], `peerDependency ${peer}`).toBeDefined();
      expect(pkg.peerDependenciesMeta?.[peer]?.optional, `${peer} doit être optionnelle`).toBe(
        true,
      );
      expect(pkg.dependencies?.[peer], `${peer} ne doit pas être une dépendance runtime`).toBe(
        undefined,
      );
    }
  });

  it("publie les 5 bundles et le README, jamais les tests", () => {
    const files = pkg.files ?? [];
    expect(files).toContain("dist");
    expect(files).toContain("README.md");
    expect(files.some((entry) => entry.includes("tests"))).toBe(false);

    const bundles = bundleFiles();
    for (const bundle of EXPECTED_BUNDLES) {
      expect(bundles, `bundle ${bundle}`).toContain(bundle);
      expect(existsSync(join(DIST_DIR, bundle)), `dist/${bundle}`).toBe(true);
    }
  });

  it("n'embarque ni postMessage ni motif de secret", () => {
    const bundles = bundleFiles();
    expect(bundles.length).toBeGreaterThanOrEqual(EXPECTED_BUNDLES.length);

    for (const bundle of bundles) {
      const content = readFileSync(join(DIST_DIR, bundle), "utf8");
      for (const { label, pattern } of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content), `${bundle} contient « ${label} »`).toBe(false);
      }
    }
  });
});
