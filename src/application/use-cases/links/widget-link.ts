import { ValidationError } from "@/application/errors";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import type {
  ActiveLinkIdentificationMode,
  ChatLinkSurface,
  ChatLinkType,
} from "@/domain/entities/chat";
import {
  type ChatLinkWidgetConfig,
  resolveWidgetPosition,
  type WidgetDisplay,
} from "@/domain/widget";

export type WidgetLinkInput = {
  surface: ChatLinkSurface;
  type: ChatLinkType;
  identificationMode: ActiveLinkIdentificationMode;
  confidentialiteId: string | null;
  visualTemplateId: string | null;
  visualTemplateVersion: string | null;
  widgetConfig: ChatLinkWidgetConfig;
};

export type WidgetTemplateInfo = {
  display: WidgetDisplay;
  widgetConfig: ChatLinkWidgetConfig;
};

/**
 * Vérifie qu'un lien peut être servi en widget (ADR-0040) et résout la position
 * effective. Les invariants sont aussi posés en base, mais l'application donne
 * un message métier précis avant l'écriture.
 */
export async function validateWidgetLink(
  visualTemplates: VisualTemplateRepository,
  organizationId: string,
  input: WidgetLinkInput,
): Promise<WidgetTemplateInfo | null> {
  if (input.surface !== "widget") return null;

  if (input.type === "standard" && input.identificationMode !== "anonymous") {
    throw new ValidationError("Un widget standard ne peut pas utiliser le formulaire de contact");
  }
  if (input.confidentialiteId !== null) {
    throw new ValidationError("Un widget ne peut pas afficher de politique de confidentialité");
  }
  if (input.visualTemplateId === null || input.visualTemplateVersion === null) {
    throw new ValidationError("Un widget exige un template visuel compatible");
  }

  const template = await visualTemplates.findAssignedById(organizationId, input.visualTemplateId);
  if (template === null) {
    throw new ValidationError("Template visuel introuvable");
  }
  const version = await visualTemplates.findVersion(template.id, input.visualTemplateVersion);
  if (version === null) {
    throw new ValidationError("Version de template visuel introuvable");
  }
  const widget = version.manifest.ui.widget;
  if (widget === undefined) {
    throw new ValidationError("Ce template ne déclare pas la surface widget (ui.widget manquant)");
  }
  if (!version.manifest.capabilities.includes("messages")) {
    throw new ValidationError("Un template widget doit déclarer la capacité messages");
  }

  const requestedPosition = input.widgetConfig.position;
  if (
    requestedPosition !== undefined &&
    !widget.display.allowedPositions.includes(requestedPosition)
  ) {
    throw new ValidationError("Position de widget non autorisée par ce template");
  }
  return {
    display: widget.display,
    widgetConfig: {
      position: resolveWidgetPosition(widget.display, input.widgetConfig),
    },
  };
}

/** Position effective pour un lien widget (défaut template si config vide). */
export function widgetPositionFor(
  display: WidgetDisplay,
  config: ChatLinkWidgetConfig,
): ReturnType<typeof resolveWidgetPosition> {
  return resolveWidgetPosition(display, config);
}
