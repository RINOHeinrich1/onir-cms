/**
 * Format d'artefact de build standalone (ADR-0106).
 * Générateur pur : le worker se charge du stockage, des assets et du hash.
 */

import type { StandaloneRuntimeConfig } from "@/domain/standalone";

export const STANDALONE_ARTIFACT_VERSION = 1;

export type StandaloneArtifactManifest = {
  version: typeof STANDALONE_ARTIFACT_VERSION;
  buildId: string;
  chatLinkId: string;
  organizationId: string;
  templateId: string;
  templateVersion: string;
  configHash: string;
  createdAt: string;
  entry: "index.html";
  runtime: {
    js: "runtime.js";
    css: "runtime.css";
  };
  files: string[];
};

export type StandaloneArtifactInput = {
  buildId: string;
  chatLinkId: string;
  organizationId: string;
  configHash: string;
  createdAt: string;
  title?: string;
  lang?: string;
  config: StandaloneRuntimeConfig;
  /** Chemins relatifs des assets template déjà copiés (sans préfixe template/). */
  templateFiles?: string[];
};

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderStandaloneIndexHtml(input: StandaloneArtifactInput): string {
  const title = escapeHtml(input.title ?? "Discussion");
  const lang = (input.lang ?? "fr").replace(/[^a-z-]/gi, "");
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="onir-build-id" content="${escapeHtml(input.buildId)}">
  <title>${title}</title>
  <link rel="stylesheet" href="./runtime.css">
</head>
<body data-onir-standalone="1">
  <div id="onir-standalone-root"></div>
  <script>window.__ONIR_STANDALONE_CONFIG__=${escapeScriptJson(input.config)};</script>
  <script src="./runtime.js" defer></script>
</body>
</html>
`;
}

export function renderStandaloneConfigJson(input: StandaloneArtifactInput): string {
  return `${JSON.stringify(input.config, null, 2)}\n`;
}

export function renderStandaloneManifest(
  input: StandaloneArtifactInput,
): StandaloneArtifactManifest {
  return {
    version: STANDALONE_ARTIFACT_VERSION,
    buildId: input.buildId,
    chatLinkId: input.chatLinkId,
    organizationId: input.organizationId,
    templateId: input.config.template.id,
    templateVersion: input.config.template.version,
    configHash: input.configHash,
    createdAt: input.createdAt,
    entry: "index.html",
    runtime: { js: "runtime.js", css: "runtime.css" },
    files: [
      "index.html",
      "config.json",
      "build.json",
      "runtime.js",
      "runtime.css",
      ...(input.templateFiles ?? []).map((file) => `template/${file}`),
    ],
  };
}

export function renderStandaloneManifestJson(input: StandaloneArtifactInput): string {
  return `${JSON.stringify(renderStandaloneManifest(input), null, 2)}\n`;
}
