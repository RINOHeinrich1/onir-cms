import { createHash } from "node:crypto";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConfidentialiteRepository } from "@/application/ports/confidentialite-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { MediaStorage } from "@/application/ports/media-storage";
import type { StandaloneBuildStorage } from "@/application/ports/standalone-build-storage";
import type { StandaloneRepository } from "@/application/ports/standalone-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import {
  buildLinkContext,
  type LinkTemplateDependencies,
  loadTemplateSpec,
} from "@/application/use-cases/visual-templates/link-template";
import type { TemplateDataDependencies } from "@/application/use-cases/visual-templates/load-template-data";
import { type ChatLinkIdentificationMode, channelsForLink } from "@/domain/entities/chat";
import type { StandaloneRuntimeConfig } from "@/domain/standalone";
import { decryptLinkToken } from "@/lib/link-crypto";
import { persistStandaloneArtifact } from "./persist-artifact";

export type StandaloneBuildDependencies = {
  links: ChatLinkRepository;
  templates: VisualTemplateRepository;
  medias: MediaRepository;
  configs: ChatbotConfigRepository;
  confidentialites: ConfidentialiteRepository;
  mediaStorage: MediaStorage;
  buildStorage: StandaloneBuildStorage;
  builds: StandaloneRepository;
  data?: TemplateDataDependencies;
  runtimeJs: Uint8Array;
  runtimeCss: Uint8Array;
};

export type PrepareBuildResult = {
  buildId: string;
  artifactKey: string;
  artifactSha256: string;
  configHash: string;
};

function initialPhase(
  type: string,
  identificationMode: ChatLinkIdentificationMode,
): "identity" | "otp" | "chat" {
  if (type === "standard" && identificationMode === "otp") return "otp";
  if (type === "standard" && identificationMode === "anonymous") return "chat";
  if (type === "standard") return "identity";
  return "chat";
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Prépare un build à partir d'un lien existant, puis le persiste.
 * Le build est marqué failed si la préparation échoue.
 */
export async function prepareAndPersistBuild(
  deps: StandaloneBuildDependencies,
  input: { buildId: string },
): Promise<PrepareBuildResult> {
  const build = await deps.builds.findBuild(input.buildId);
  if (build === null) throw new Error("Build introuvable");
  if (build.status !== "queued" && build.status !== "building") {
    throw new Error("Ce build n'est pas en attente");
  }

  try {
    const link = await deps.links.findById(build.organizationId, build.chatLinkId);
    if (link === null || !link.actif) throw new Error("Chatbot introuvable ou inactif");
    const channel = channelsForLink(link).page;
    if (!channel.enabled) throw new Error("Le canal page publique est désactivé");

    const tokenEnc = await deps.links.getTokenEnc(link.organizationId, link.id);
    if (tokenEnc === null) throw new Error("Token public introuvable");
    const token = decryptLinkToken(tokenEnc);

    const templateDeps: LinkTemplateDependencies = {
      visualTemplates: deps.templates,
      medias: deps.medias,
      configs: deps.configs,
      ...(deps.data === undefined ? {} : { data: deps.data }),
    };
    const spec = await loadTemplateSpec(templateDeps, link, "page", channel);
    if (spec === null) throw new Error("Aucun template visuel rattaché au canal page");

    const version = await deps.templates.findVersion(spec.id, spec.version);
    if (version === null) throw new Error("Version de template introuvable");
    if (version.mode !== "web-component") {
      throw new Error("Le build standalone iframe n'est pas supporté en V1");
    }

    let consent: { texte: string; lien: string } | null = null;
    if (channel.confidentialiteId !== null) {
      const policy = await deps.confidentialites.findById(
        link.organizationId,
        channel.confidentialiteId,
      );
      if (policy?.actif === true) consent = { texte: policy.texte, lien: policy.lien };
    }

    const phase = initialPhase(link.type, channel.identificationMode);
    const context = await buildLinkContext(templateDeps, link, spec, {
      phase,
      messages: [],
      consent,
      surface: "page",
      channel,
    });

    const config: StandaloneRuntimeConfig = {
      version: 1,
      // Same-origin : l'edge proxifie /api/chat vers ONIR-CMS.
      chatApiBaseUrl: "/api/chat",
      token,
      template: spec,
      context,
      conversationId: null,
      initialMessages: [],
      anonymous: link.type === "standard" && channel.identificationMode === "anonymous",
    };
    const configHash = sha256(
      JSON.stringify({
        token,
        template: spec,
        context,
        chatApiBaseUrl: config.chatApiBaseUrl,
      }),
    );

    const assets = await deps.templates.listAssets(version.id);
    const templateFiles = await Promise.all(
      assets.map(async (asset) => {
        const file = await deps.mediaStorage.read(asset.storageKey);
        if (file === null) throw new Error(`Asset template introuvable : ${asset.path}`);
        return {
          path: asset.path,
          contentType: asset.mime || file.contentType,
          data: file.data,
        };
      }),
    );

    const persisted = await persistStandaloneArtifact(
      { storage: deps.buildStorage, builds: deps.builds },
      {
        buildId: build.id,
        chatLinkId: link.id,
        organizationId: link.organizationId,
        configHash,
        createdAt: build.createdAt,
        title: link.label,
        config,
        templateEntryPath: version.entry,
        runtimeJs: deps.runtimeJs,
        runtimeCss: deps.runtimeCss,
        templateFiles,
      },
    );

    return {
      buildId: build.id,
      artifactKey: persisted.artifactKey,
      artifactSha256: persisted.artifactSha256,
      configHash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de build standalone";
    await deps.builds.markBuildFailed({ id: build.id, error: message }).catch(() => undefined);
    throw error;
  }
}
