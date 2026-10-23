/**
 * Contrat d'options du sous-chemin `@onirtech/template-sdk/vite`
 * (ADR-0024 §9.1, §11).
 *
 * L'option `plugins` est une **extension additive** à l'ADR §9.1 : React et Vue
 * ont besoin de leurs plugins de compilation (`@vitejs/plugin-react`,
 * `@vitejs/plugin-vue`) fournis par le projet template, sans que celui-ci
 * réimplémente la configuration. `vite` reste une **peer dependency**
 * optionnelle : aucune dépendance runtime n'est ajoutée au SDK.
 */
import type { PluginOption } from "vite";

/** Options de `defineTemplateConfig`. */
export type TemplateConfigOptions = {
  /** Entrée du bundle, relative à la racine du projet (ex. `"src/index.ts"`). */
  entry: string;
  /** Nom du Custom Element ; doit être **identique** à `ui.element` du manifeste. */
  element: string;
  /** Chemin du `manifest.ts` ; si fourni, `onirtech.template.json` est émis au build. */
  manifest?: string;
  /** Minification du bundle (défaut `true`, production). */
  minify?: boolean;
  /**
   * Plugins Vite supplémentaires (`@vitejs/plugin-react`, `@vitejs/plugin-vue`,
   * plugins du projet…). Additif : les plugins du SDK sont toujours ajoutés.
   */
  plugins?: PluginOption[];
  /** Dossier de sortie du bundle (défaut `"dist"`). */
  outDir?: string;
};

/** Dossier de sortie par défaut du bundle de template. */
export const DEFAULT_OUT_DIR = "dist";

/**
 * Limite d'inlining des assets (1 Mio) : polices et images légères voyagent
 * dans le bundle, aucune requête externe non déclarée dans `network`.
 */
export const INLINE_LIMIT = 1024 * 1024;
