/**
 * Manifeste `onirtech.template.json` du build Vite (ADR-0024 §9, §11).
 *
 * Le manifeste est **la seule source de vérité** des métadonnées ; le build y
 * injecte les champs dérivés (`ui.entry`, `ui.integrity`) calculés sur le
 * bundle réellement produit. L'ordre `build → validate → pack` reste valide :
 * l'intégrité écrite ici correspond au fichier `dist/index.js` final.
 *
 * Chargement d'un `manifest.ts` sans dépendance supplémentaire : le source est
 * transformé en ESM par `transformWithEsbuild` (exporté par `vite`), écrit dans
 * un temporaire **à côté** du manifeste (résolution des imports nus), importé
 * dynamiquement puis supprimé.
 */
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import * as vite from "vite";
import { TEMPLATE_HOST_PROTOCOL } from "../constants.js";

/** Options d'assemblage du manifeste final. */
export type ManifestBuildOptions = {
  /** Nom du Custom Element attendu (option `element`). */
  element: string;
  /** Entrée du bundle, relative à la racine du template (POSIX, `./dist/index.js`). */
  entry: string;
  /** Intégrité SRI du bundle produit (`sha256-<base64>`). */
  integrity: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Calcule l'intégrité SRI `sha256-<base64>` d'un buffer de bundle. */
export function computeSri(buffer: Uint8Array): string {
  return `sha256-${createHash("sha256").update(buffer).digest("base64")}`;
}

/**
 * Construit le JSON du manifeste final.
 *
 * - vérifie que `manifest.ui.element` correspond à l'option `element` ;
 * - force `ui.mode: "web-component"` (transport v1) ;
 * - injecte `ui.entry` et `ui.integrity` calculés sur le bundle ;
 * - complète `schemaVersion`, `kind`, `compatibility.hostProtocol` et `network`
 *   s'ils sont absents (défensif : `defineManifest` les fournit déjà).
 *
 * Lève si le manifeste n'est pas un objet ou si `ui.element` diverge : un
 * template silencieusement non monté est pire qu'un build en échec.
 */
export function buildManifestJson(manifest: unknown, options: ManifestBuildOptions): string {
  if (!isRecord(manifest)) {
    throw new Error("[template-sdk/vite] manifest.ts doit exporter un objet (defineManifest).");
  }
  const ui = isRecord(manifest.ui) ? manifest.ui : {};
  if (ui.element !== options.element) {
    throw new Error(
      `[template-sdk/vite] ui.element du manifeste (${String(ui.element)}) ≠ option element (${options.element}).`,
    );
  }
  const compatibility = isRecord(manifest.compatibility) ? manifest.compatibility : {};
  const out: Record<string, unknown> = {
    ...manifest,
    schemaVersion: manifest.schemaVersion ?? 1,
    kind: manifest.kind ?? "template",
    compatibility: {
      ...compatibility,
      hostProtocol: compatibility.hostProtocol ?? TEMPLATE_HOST_PROTOCOL,
    },
    ui: {
      ...ui,
      mode: "web-component",
      entry: options.entry,
      element: options.element,
      integrity: options.integrity,
    },
    network: Array.isArray(manifest.network) ? manifest.network : [],
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * Transforme un `manifest.ts` en ESM exécutable.
 *
 * Vite 8 (Rolldown) déprécie `transformWithEsbuild`, qui exige désormais
 * `esbuild` installé séparément dans le projet. On privilégie
 * `transformWithOxc` (fourni par Vite 8) et on retombe sur
 * `transformWithEsbuild` avec Vite 6/7, qui l'embarquent.
 */
async function transformManifestSource(code: string, file: string): Promise<string> {
  const transforms = vite as unknown as {
    transformWithOxc?: (source: string, filename: string) => Promise<{ code: string }>;
    transformWithEsbuild?: (
      source: string,
      filename: string,
      options: Record<string, unknown>,
    ) => Promise<{ code: string }>;
  };
  if (transforms.transformWithOxc) {
    return (await transforms.transformWithOxc(code, file)).code;
  }
  if (!transforms.transformWithEsbuild) {
    throw new Error(
      "[template-sdk/vite] Vite ne fournit ni transformWithOxc ni transformWithEsbuild.",
    );
  }
  return (
    await transforms.transformWithEsbuild(code, file, {
      loader: "ts",
      format: "esm",
      target: "node20",
    })
  ).code;
}

/**
 * Charge un `manifest.ts` typé au build et retourne son export par défaut.
 *
 * Le temporaire est écrit à côté du manifeste pour que ses imports nus
 * (`@onirtech/template-sdk`) se résolvent depuis le `node_modules` du projet,
 * puis supprimé dans tous les cas (`finally`).
 */
export async function loadManifestFile(file: string): Promise<unknown> {
  const absolute = isAbsolute(file) ? file : join(process.cwd(), file);
  const source = await readFile(absolute, "utf8");
  const code = await transformManifestSource(source, absolute);
  const temp = join(dirname(absolute), `${basename(absolute)}.onirtech.${process.pid}.mjs`);
  await writeFile(temp, code, "utf8");
  try {
    const loaded = (await import(`${pathToFileURL(temp).href}?t=${Date.now()}`)) as {
      default?: unknown;
    };
    return isRecord(loaded) && "default" in loaded ? loaded.default : loaded;
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}
