import { ValidationError } from "@/application/errors";
import type { StandaloneRuntimeConfig } from "@/domain/standalone";
import {
  renderStandaloneConfigJson,
  renderStandaloneIndexHtml,
  renderStandaloneManifest,
  renderStandaloneManifestJson,
  type StandaloneArtifactManifest,
} from "@/domain/standalone-artifact";

export type StandaloneTemplateFile = {
  path: string;
  contentType: string;
  data: Uint8Array;
};

export type StandaloneArtifactFile = {
  path: string;
  contentType: string;
  data: Uint8Array;
};

export type AssembleStandaloneArtifactInput = {
  buildId: string;
  chatLinkId: string;
  organizationId: string;
  configHash: string;
  createdAt: string;
  title?: string;
  lang?: string;
  config: StandaloneRuntimeConfig;
  templateEntryPath: string;
  runtimeJs: Uint8Array;
  runtimeCss: Uint8Array;
  templateFiles: StandaloneTemplateFile[];
};

export type AssembledStandaloneArtifact = {
  manifest: StandaloneArtifactManifest;
  files: StandaloneArtifactFile[];
};

function safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    normalized === "" ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new ValidationError(`Chemin d'asset template invalide : ${value}`);
  }
  return normalized;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Assemble les fichiers d'un build V1 (Web Component uniquement). */
export function assembleStandaloneArtifact(
  input: AssembleStandaloneArtifactInput,
): AssembledStandaloneArtifact {
  if (input.config.template.mode !== "web-component") {
    throw new ValidationError("Le build standalone iframe n'est pas encore supporté en V1");
  }

  const templateFiles = input.templateFiles.map((file) => ({
    ...file,
    path: safeRelativePath(file.path),
  }));
  const entryPath = safeRelativePath(input.templateEntryPath);
  const template = {
    ...input.config.template,
    entryUrl: `./template/${entryPath}`,
  };
  delete template.frameUrl;
  const config: StandaloneRuntimeConfig = { ...input.config, template };
  const artifactInput = {
    buildId: input.buildId,
    chatLinkId: input.chatLinkId,
    organizationId: input.organizationId,
    configHash: input.configHash,
    createdAt: input.createdAt,
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.lang === undefined ? {} : { lang: input.lang }),
    config,
    templateFiles: templateFiles.map((file) => file.path),
  };

  const manifest = renderStandaloneManifest(artifactInput);
  const files: StandaloneArtifactFile[] = [
    {
      path: "index.html",
      contentType: "text/html; charset=utf-8",
      data: utf8(renderStandaloneIndexHtml(artifactInput)),
    },
    {
      path: "config.json",
      contentType: "application/json; charset=utf-8",
      data: utf8(renderStandaloneConfigJson(artifactInput)),
    },
    {
      path: "build.json",
      contentType: "application/json; charset=utf-8",
      data: utf8(renderStandaloneManifestJson(artifactInput)),
    },
    {
      path: "runtime.js",
      contentType: "text/javascript; charset=utf-8",
      data: input.runtimeJs,
    },
    {
      path: "runtime.css",
      contentType: "text/css; charset=utf-8",
      data: input.runtimeCss,
    },
    ...templateFiles.map((file) => ({
      path: `template/${file.path}`,
      contentType: file.contentType,
      data: file.data,
    })),
  ];

  return { manifest, files };
}
