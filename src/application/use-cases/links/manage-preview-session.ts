import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type {
  CreatePreviewSessionInput,
  PreviewSessionRepository,
  PreviewSurface,
  UpdatePreviewSessionInput,
} from "@/application/ports/preview-session-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { generatePreviewToken, hashPreviewToken } from "@/domain/preview-token";
import { normalizeTemplateParamValues } from "@/domain/template-params";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

export type PreviewSessionDependencies = {
  links: ChatLinkRepository;
  templates: VisualTemplateRepository;
  previews: PreviewSessionRepository;
};

export type PreviewSessionInput = {
  token?: string | null;
  surface: PreviewSurface;
  template?: string | null;
  params?: unknown;
};

export type PreviewSessionResult = { token: string; expiresAt: string };

function parseTemplateSelection(value: string | null | undefined): {
  id: string;
  version: string;
} | null {
  if (value === undefined || value === null || value === "") return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) {
    throw new ValidationError("Sélection de template invalide");
  }
  return { id: value.slice(0, at), version: value.slice(at + 1) };
}

export async function savePreviewSession(
  deps: PreviewSessionDependencies,
  actor: Actor,
  linkId: string,
  input: PreviewSessionInput,
): Promise<PreviewSessionResult> {
  assertCan(actor, "links:update");
  const organizationId = organizationOf(actor);
  const link = await deps.links.findById(organizationId, linkId);
  if (link === null) throw new NotFoundError("Lien introuvable");

  if (input.surface !== "page" && input.surface !== "widget") {
    throw new ValidationError("Surface invalide");
  }

  const selection = parseTemplateSelection(input.template);
  if (selection !== null) {
    const template = await deps.templates.findByIdForOrganization(
      organizationId,
      selection.id,
      true,
    );
    const version =
      template === null ? null : await deps.templates.findVersion(template.id, selection.version);
    if (template === null || version === null) {
      throw new ValidationError("Template ou version introuvable");
    }
  }

  const params = normalizeTemplateParamValues(input.params);
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
  const common: UpdatePreviewSessionInput = {
    userId: actor.id,
    organizationId,
    linkId,
    surface: input.surface,
    templateId: selection?.id ?? null,
    templateVersion: selection?.version ?? null,
    params,
    expiresAt,
  };

  const existingToken = input.token?.trim() ?? "";
  if (existingToken !== "") {
    const updated = await deps.previews.updateByToken(hashPreviewToken(existingToken), common);
    if (updated !== null) {
      return { token: existingToken, expiresAt: updated.expiresAt };
    }
  }

  const token = generatePreviewToken();
  const create: CreatePreviewSessionInput = {
    ...common,
    tokenHash: hashPreviewToken(token),
  };
  const created = await deps.previews.create(create);
  await deps.previews.deleteExpired().catch(() => 0);
  return { token, expiresAt: created.expiresAt };
}
