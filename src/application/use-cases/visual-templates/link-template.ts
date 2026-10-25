import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import type { ChatLink, ChatMessage } from "@/domain/entities/chat";
import {
  buildTemplateContext,
  type TemplateContextPayload,
  type TemplateFormField,
  type TemplateMessage,
  type TemplateSpec,
} from "@/domain/template-contract";
import { resolveTemplateParams } from "@/domain/template-params";
import { signedAttachmentUrl } from "@/lib/attachment-token";
import { signedMediaUrl } from "@/lib/media-token";
import { loadTemplateData, type TemplateDataDependencies } from "./load-template-data";

export type LinkTemplateDependencies = {
  visualTemplates: VisualTemplateRepository;
  medias: MediaRepository;
  templates: ChatTemplateRepository;
  /** Fournisseur de données (ADR-0026) — requis seulement pour les contrats `eager`. */
  data?: TemplateDataDependencies;
};

/** Charge le template visuel rattaché au lien (spec), sinon null. */
export async function loadTemplateSpec(
  deps: LinkTemplateDependencies,
  link: ChatLink,
): Promise<TemplateSpec | null> {
  if (link.visualTemplateId === null || link.visualTemplateVersion === null) return null;
  const template = await deps.visualTemplates.findById(link.visualTemplateId);
  if (template === null) return null;
  const version = await deps.visualTemplates.findVersion(template.id, link.visualTemplateVersion);
  if (version === null) return null;
  return {
    id: template.id,
    versionId: version.id,
    version: version.version,
    mode: version.mode,
    entryUrl: `/api/template-assets/${template.id}/${version.version}/${version.entry}`,
    element: version.manifest.ui.element,
    capabilities: version.manifest.capabilities,
    // Manifestes legacy (avant ADR-0023) : `params` absent => aucun paramètre.
    params: Array.isArray(version.manifest.params) ? version.manifest.params : [],
    dataContracts: Array.isArray(version.manifest.dataContracts)
      ? version.manifest.dataContracts
      : [],
  };
}

/** Convertit les messages du domaine en messages du contrat. */
export function toContractMessages(
  messages: ChatMessage[],
  organizationId?: string,
): TemplateMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    medias: message.medias.map((media) => ({
      type: media.type,
      libelle: media.libelle,
      url: media.url,
    })),
    ...(message.attachments.length === 0
      ? {}
      : {
          attachments: message.attachments.map((attachment) => ({
            id: attachment.id,
            fieldName: attachment.fieldName,
            fieldLabel: attachment.fieldLabel,
            originalName: attachment.originalName,
            mime: attachment.mime,
            sizeBytes: attachment.sizeBytes,
            createdAt: attachment.createdAt,
            url: organizationId
              ? signedAttachmentUrl(attachment.id, organizationId)
              : `/api/chat/attachments/${attachment.id}/file`,
          })),
        }),
    at: message.createdAt,
  }));
}

/**
 * Construit le contexte remis au template (capacités **filtrées**). Les ressources
 * non déclarées ne sont pas fournies (ni média, ni champs du modèle).
 */
export async function buildLinkContext(
  deps: LinkTemplateDependencies,
  link: ChatLink,
  spec: TemplateSpec,
  input: {
    phase: "identity" | "chat";
    messages: TemplateMessage[];
    consent: { texte: string; lien: string } | null;
    theme?: Record<string, string>;
    /** Aperçu : valeurs non enregistrées qui remplacent celles du lien. */
    paramsOverride?: unknown;
  },
): Promise<TemplateContextPayload> {
  const caps = spec.capabilities;
  let media: TemplateContextPayload["resources"]["media"] = { photos: [], liens: [] };
  if (caps.includes("media")) {
    const [photos, liens] = await Promise.all([
      deps.medias.listActivesByType(link.organizationId, "photo", link.templateKey),
      deps.medias.listActivesByType(link.organizationId, "lien", link.templateKey),
    ]);
    media = {
      photos: photos.map((m) => ({
        id: m.id,
        libelle: m.libelle,
        url: signedMediaUrl(m.id, link.organizationId),
      })),
      liens: liens.map((m) => ({ id: m.id, libelle: m.libelle, url: m.url ?? "" })),
    };
  }
  let modelForm: TemplateFormField[] | null = null;
  if (caps.includes("modelForm")) {
    const template = await deps.templates.findVersion(
      link.organizationId,
      link.templateKey,
      link.templateVersion,
    );
    modelForm =
      template?.definition.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        ...(field.options === undefined ? {} : { options: field.options }),
        ...(field.file === undefined
          ? {}
          : {
              accept: field.file.accept,
              maxFiles: field.file.maxFiles,
              maxBytes: field.file.maxBytes,
            }),
      })) ?? null;
  }
  const context = buildTemplateContext({
    link: { type: link.type, label: link.label },
    locale: "fr",
    brand: { name: "ONIRTECH", logoUrl: null },
    theme: input.theme ?? link.visualTemplateConfig,
    // Résolution unique, tolérante : défauts ⊕ valeurs (invalid -> défaut).
    params: resolveTemplateParams(
      spec.params,
      input.paramsOverride === undefined ? link.visualTemplateParams : input.paramsOverride,
    ),
    capabilities: caps,
    consent: input.consent,
    phase: input.phase,
    status: "en_cours",
    messages: input.messages,
    typing: false,
    media,
    modelForm,
    pendingAttachments: [],
    // Double garde (ADR-0020) : flag lien exposé au contexte + sources.
    userStateEnabled: link.userStateEnabled,
    knowledgeEnabled: link.sources.connaissances,
  });

  if (deps.data !== undefined) {
    const eager = spec.dataContracts.filter((contract) => contract.loading === "eager");
    if (eager.length > 0) {
      const data: Record<string, unknown> = {};
      for (const contract of eager) {
        const result = await loadTemplateData(deps.data, { link, spec, contractKey: contract.key });
        if (result.status === "ok") data[contract.key] = result.data;
      }
      if (Object.keys(data).length > 0) context.resources.data = data;
    }
  }
  return context;
}
