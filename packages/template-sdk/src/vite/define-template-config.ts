/**
 * `defineTemplateConfig` — configuration Vite d'un template (ADR-0024 §9.1).
 *
 * Une seule ligne remplace un `build.lib` fragile : bundle ESM unique, CSS non
 * splitté, assets inlinés, `target: es2022`, minification production et
 * émission du manifeste. Les plugins du projet (React/Vue) sont **additifs**.
 */
import type { UserConfig } from "vite";
import type { TemplateConfigOptions } from "./options.js";
import { DEFAULT_OUT_DIR, INLINE_LIMIT } from "./options.js";
import { templateManifestPlugin } from "./plugin.js";

/**
 * `inlineDynamicImports` est l'option historique (Vite 6/7) ; Rolldown
 * (Vite 8) la mappe sur `codeSplitting: false` tout en la signalant obsolète.
 * Le cast préserve le contrat ADR §9.1 (aucun chunk dynamique dispersé).
 */
type BuildOutput = NonNullable<
  NonNullable<NonNullable<UserConfig["build"]>["rollupOptions"]>["output"]
>;

const INLINE_OUTPUT = { inlineDynamicImports: true } as unknown as BuildOutput;

/** Construit la configuration Vite correcte pour un template Onirtech. */
export function defineTemplateConfig(options: TemplateConfigOptions): UserConfig {
  return {
    // React (et d'autres bibliothèques) lisent `process.env.NODE_ENV` à
    // l'exécution. En build lib, Vite ne le remplace pas : sans ce `define`,
    // le navigateur lève « process is not defined ». La valeur est figée au
    // build (`vite build` positionne NODE_ENV=production).
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    },
    plugins: [...(options.plugins ?? []), templateManifestPlugin(options)],
    build: {
      target: "es2022",
      cssCodeSplit: false,
      assetsInlineLimit: INLINE_LIMIT,
      minify: options.minify ?? true,
      emptyOutDir: true,
      outDir: options.outDir ?? DEFAULT_OUT_DIR,
      lib: {
        entry: options.entry,
        formats: ["es"],
        fileName: () => "index.js",
      },
      rollupOptions: {
        output: INLINE_OUTPUT,
      },
    },
  };
}
