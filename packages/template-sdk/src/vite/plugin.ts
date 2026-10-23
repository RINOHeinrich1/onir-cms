/**
 * Plugin Vite d'émission du manifeste (ADR-0024 §9, §11).
 *
 * Le manifeste est écrit **après** le bundle (`closeBundle`) : l'intégrité SRI
 * porte donc sur le `dist/index.js` final, et l'ordre `build → validate → pack`
 * est réellement valide. Le plugin est limité au build (`apply: "build"`) :
 * aucun manifeste n'est émis en développement.
 */
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { buildManifestJson, computeSri, loadManifestFile } from "./manifest.js";
import type { TemplateConfigOptions } from "./options.js";

/** Nom du fichier de bundle produit par `build.lib.fileName`. */
const BUNDLE_FILE = "index.js";

/** Nom du manifeste émis à la racine du projet template. */
const MANIFEST_FILE = "onirtech.template.json";

/** Convertit un chemin relatif hôte en chemin POSIX (manifeste portable). */
function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

/**
 * Construit le plugin qui émet `onirtech.template.json` depuis `manifest.ts`.
 *
 * Sans option `manifest`, le plugin est inerte (template sans manifeste typé).
 */
export function templateManifestPlugin(options: TemplateConfigOptions): Plugin {
  let root = process.cwd();
  let outDir = "";

  return {
    name: "onirtech-template-manifest",
    apply: "build",

    configResolved(config) {
      root = config.root;
      outDir = resolve(root, config.build.outDir);
    },

    async closeBundle() {
      if (options.manifest === undefined) return;

      const bundlePath = join(outDir, BUNDLE_FILE);
      const bundle = await readFile(bundlePath);
      // Cohérence bundle ↔ manifeste : le validateur du kit exige que l'entrée
      // enregistre l'élément déclaré (template-kit/bin/onirtech-template.mjs).
      if (!bundle.includes(options.element)) {
        throw new Error(
          `[template-sdk/vite] ${toPosixPath(relative(root, bundlePath))} ne contient pas ` +
            `l'élément "${options.element}" : le bundle et l'option element divergent.`,
        );
      }

      const manifestPath = isAbsolute(options.manifest)
        ? options.manifest
        : resolve(root, options.manifest);
      const manifest = await loadManifestFile(manifestPath);
      const entry = `./${toPosixPath(relative(root, bundlePath))}`;
      const json = buildManifestJson(manifest, {
        element: options.element,
        entry,
        integrity: computeSri(bundle),
      });
      await writeFile(join(root, MANIFEST_FILE), json, "utf8");
    },
  };
}
