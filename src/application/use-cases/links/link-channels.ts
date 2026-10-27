import { ValidationError } from "@/application/errors";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import {
  type ActiveLinkIdentificationMode,
  type ChatLinkChannel,
  type ChatLinkChannels,
  type ChatLinkSurface,
  type ChatLinkType,
  parseVisualTemplateConfig,
  parseWidgetConfig,
} from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import { parseIdentificationMode, parseSurface } from "./link-fields";
import { prepareLinkParams } from "./link-params";
import { validateWidgetLink } from "./widget-link";

type ChannelSource = Record<string, unknown>;

export type ResolveLinkChannelsInput = {
  type: ChatLinkType;
  /** Corps de création/édition ; `channels` est optionnel (compatibilité). */
  source: Record<string, unknown>;
  /** Canaux existants en édition. */
  existing?: ChatLinkChannels;
  /** Politique par défaut du canal page (création). */
  defaultConfidentialiteId?: string | null;
  visualTemplates: VisualTemplateRepository;
  organizationId: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function channelSource(
  source: Record<string, unknown>,
  channel: ChatLinkSurface,
): ChannelSource | null {
  const channels = object(source.channels);
  if (channels === null) return null;
  return object(channels[channel]);
}

function has(source: ChannelSource, key: string): boolean {
  return Object.hasOwn(source, key);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function enabledFor(
  channel: ChatLinkSurface,
  raw: ChannelSource | null,
  existing: ChatLinkChannel | undefined,
  legacySurface: ChatLinkSurface,
): boolean {
  if (raw !== null && has(raw, "enabled")) return raw.enabled === true;
  if (existing !== undefined) return existing.enabled;
  return legacySurface === channel;
}

async function resolveChannel(
  input: ResolveLinkChannelsInput,
  channel: ChatLinkSurface,
  raw: ChannelSource | null,
  existing: ChatLinkChannel | undefined,
  legacySurface: ChatLinkSurface,
): Promise<ChatLinkChannel> {
  const enabled = enabledFor(channel, raw, existing, legacySurface);

  let identificationMode: ActiveLinkIdentificationMode = parseIdentificationMode(
    raw !== null && has(raw, "identificationMode")
      ? raw.identificationMode
      : existing?.identificationMode,
  );
  if (input.type === "specifique") {
    if (channel === "page" && identificationMode !== "contact") {
      throw new ValidationError(
        "Un lien spécifique utilise le prospect rattaché : le mode anonyme est indisponible",
      );
    }
    identificationMode = "contact";
  }
  if (channel === "widget" && input.type === "standard") {
    if (raw !== null && has(raw, "identificationMode") && raw.identificationMode !== "anonymous") {
      throw new ValidationError("Un widget standard ne peut pas utiliser le formulaire de contact");
    }
    identificationMode = "anonymous";
  }

  let confidentialiteId: string | null = existing?.confidentialiteId ?? null;
  if (channel === "widget") {
    if (
      raw !== null &&
      has(raw, "confidentialiteId") &&
      stringOrNull(raw.confidentialiteId) !== null
    ) {
      throw new ValidationError("Un widget ne peut pas porter de politique de confidentialité");
    }
    confidentialiteId = null;
  } else if (raw !== null && has(raw, "confidentialiteId")) {
    confidentialiteId = stringOrNull(raw.confidentialiteId);
  } else if (existing === undefined) {
    confidentialiteId = input.defaultConfidentialiteId ?? null;
  }

  const visualTemplateId =
    raw !== null && has(raw, "visualTemplateId")
      ? stringOrNull(raw.visualTemplateId)
      : (existing?.visualTemplateId ?? null);
  const visualTemplateVersion =
    raw !== null && has(raw, "visualTemplateVersion")
      ? stringOrNull(raw.visualTemplateVersion)
      : (existing?.visualTemplateVersion ?? null);

  const visualTemplateConfig =
    raw !== null && has(raw, "visualTemplateConfig")
      ? parseVisualTemplateConfig(raw.visualTemplateConfig)
      : (existing?.visualTemplateConfig ?? {});

  const templateChanged =
    visualTemplateId !== (existing?.visualTemplateId ?? null) ||
    visualTemplateVersion !== (existing?.visualTemplateVersion ?? null);
  let visualTemplateParams: TemplateParamValues = templateChanged
    ? {}
    : (existing?.visualTemplateParams ?? {});
  if (raw !== null && has(raw, "visualTemplateParams")) {
    visualTemplateParams = await prepareLinkParams(
      input.visualTemplates,
      visualTemplateId,
      visualTemplateVersion,
      raw.visualTemplateParams,
    );
  }

  let widgetConfig = parseWidgetConfig(
    raw !== null && has(raw, "widgetConfig") ? raw.widgetConfig : existing?.widgetConfig,
  );

  if (visualTemplateId !== null && visualTemplateId !== (existing?.visualTemplateId ?? null)) {
    const assigned = await input.visualTemplates.findAssignedById(
      input.organizationId,
      visualTemplateId,
    );
    if (assigned === null) {
      throw new ValidationError("Template visuel introuvable");
    }
  }

  if (channel === "widget" && enabled) {
    const widgetInfo = await validateWidgetLink(input.visualTemplates, input.organizationId, {
      surface: "widget",
      type: input.type,
      identificationMode,
      confidentialiteId,
      visualTemplateId,
      visualTemplateVersion,
      widgetConfig,
    });
    widgetConfig = widgetInfo?.widgetConfig ?? widgetConfig;
  }

  return {
    channel,
    enabled,
    identificationMode,
    confidentialiteId,
    visualTemplateId,
    visualTemplateVersion,
    visualTemplateConfig,
    visualTemplateParams,
    widgetConfig,
  };
}

/**
 * Résout les deux canaux d'un lien.
 * - `source.channels` présent : patch par canal (création ou édition) ;
 * - absent : compatibilité avec `surface` + champs historiques.
 */
export async function resolveLinkChannels(
  input: ResolveLinkChannelsInput,
): Promise<ChatLinkChannels> {
  const legacySurface =
    "surface" in input.source
      ? parseSurface(input.source.surface)
      : input.existing?.page.enabled
        ? "page"
        : input.existing?.widget.enabled
          ? "widget"
          : "page";
  const channels = object(input.source.channels);
  const pageRaw = channelSource(input.source, "page");
  const widgetRaw = channelSource(input.source, "widget");
  const existing = input.existing;
  const useLegacySource = channels === null;

  const page = await resolveChannel(
    input,
    "page",
    pageRaw ?? (useLegacySource && legacySurface === "page" ? input.source : null),
    existing?.page,
    legacySurface,
  );
  const widget = await resolveChannel(
    input,
    "widget",
    widgetRaw ?? (useLegacySource && legacySurface === "widget" ? input.source : null),
    existing?.widget,
    legacySurface,
  );
  return { page, widget };
}
