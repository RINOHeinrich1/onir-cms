/**
 * Surface widget des liens de chat (ADR-0040).
 * Le widget est une **surface de diffusion** : il ne change ni le type de lien
 * ni le transport du template. Le template fournit l'interface, le cœur fournit
 * le conteneur iframe, la position et les bornes.
 */

export const WIDGET_POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;

export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

export function isWidgetPosition(value: string): value is WidgetPosition {
  return (WIDGET_POSITIONS as readonly string[]).includes(value);
}

export type WidgetSize = {
  width: number;
  height: number;
};

/** Réglages d'affichage déclarés par un template (norme v1, bloc `ui.widget`). */
export type WidgetDisplay = {
  defaultPosition: WidgetPosition;
  allowedPositions: WidgetPosition[];
  closedSize: WidgetSize;
  openSize: WidgetSize;
  maxSize: WidgetSize;
};

/** Défauts utilisés si le template ne fournit pas de bloc `display`. */
export const DEFAULT_WIDGET_DISPLAY: WidgetDisplay = {
  defaultPosition: "bottom-right",
  allowedPositions: ["bottom-right", "bottom-left"],
  closedSize: { width: 64, height: 64 },
  openSize: { width: 420, height: 680 },
  maxSize: { width: 520, height: 760 },
};

/** Réglages d'intégration stockés sur le lien (génériques, pas template-specific). */
export type ChatLinkWidgetConfig = {
  position?: WidgetPosition;
};

/** Normalise la config widget d'un lien ; toute valeur inconnue est ignorée. */
export function parseChatLinkWidgetConfig(value: unknown): ChatLinkWidgetConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const position = record.position;
  if (typeof position !== "string" || !isWidgetPosition(position)) return {};
  return { position };
}

/** Position effective : override du lien, sinon défaut du template. */
export function resolveWidgetPosition(
  display: WidgetDisplay,
  config: ChatLinkWidgetConfig,
): WidgetPosition {
  const requested = config.position;
  if (requested !== undefined && display.allowedPositions.includes(requested)) {
    return requested;
  }
  return display.defaultPosition;
}
