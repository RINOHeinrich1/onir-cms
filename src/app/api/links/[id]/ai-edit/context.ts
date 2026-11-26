import type { Pool } from "pg";
import type { Actor } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { TemplateEditSessionContext } from "@/application/use-cases/visual-templates/template-edit-session";
import {
  validateTemplateEditorCollectionValues,
  validateTemplateEditorStructureValues,
} from "@/domain/template-editor";
import {
  normalizeTemplateParamValuesStrict,
  type TemplateParamValues,
  validateTemplateParamValues,
} from "@/domain/template-params";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";

export type LoadedTemplateEditContext = TemplateEditSessionContext & {
  organizationId: string;
};

export function surfaceFrom(value: unknown): "page" | "widget" {
  return value === "widget" ? "widget" : "page";
}

export function paramsFrom(
  raw: unknown,
  fallback: TemplateParamValues,
  context: Pick<LoadedTemplateEditContext, "schema" | "editor">,
): TemplateParamValues {
  if (raw === undefined) return fallback;
  const normalized = normalizeTemplateParamValuesStrict(raw);
  if (!normalized.ok) {
    throw new ValidationError(
      normalized.errors.map((error) => `${error.field} — ${error.message}`).join(" ; "),
    );
  }
  const errors = validateTemplateParamValues(context.schema, normalized.value);
  if (context.editor.version === 2) {
    errors.push(
      ...validateTemplateEditorCollectionValues(context.editor, normalized.value),
      ...validateTemplateEditorStructureValues(context.editor, normalized.value),
    );
  }
  if (errors.length > 0) {
    throw new ValidationError(
      errors.map((error) => `${error.field} — ${error.message}`).join(" ; "),
    );
  }
  return normalized.value;
}

export async function loadTemplateEditContext(
  pool: Pool,
  actor: Actor,
  linkId: string,
  surface: "page" | "widget",
): Promise<LoadedTemplateEditContext> {
  const organizationId = actor.organizationId;
  if (organizationId === null) throw new ValidationError("Organisation absente");
  const link = await pgChatLinkRepository(pool).findById(organizationId, linkId);
  if (link === null) throw new ValidationError("Lien introuvable");
  if (link.visualTemplateId === null || link.visualTemplateVersion === null) {
    throw new ValidationError("Aucun template visuel rattaché à ce lien");
  }
  const version = await pgVisualTemplateRepository(pool).findVersion(
    link.visualTemplateId,
    link.visualTemplateVersion,
  );
  if (version === null) throw new ValidationError("Version de template introuvable");
  return {
    organizationId,
    linkId,
    surface,
    templateId: link.visualTemplateId,
    templateVersion: link.visualTemplateVersion,
    editor: version.manifest.editor ?? { version: 1, regions: [], bindings: [] },
    schema: version.manifest.params,
    workingParams: link.visualTemplateParams,
  };
}
