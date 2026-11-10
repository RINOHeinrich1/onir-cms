export type AssistantPosition = { x: number; y: number };
export type AssistantSize = { width: number; height: number };
export type AssistantViewport = { width: number; height: number };
export type AssistantRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export const ASSISTANT_WIDGET_WIDTH = 98;
export const ASSISTANT_WIDGET_HEIGHT = 108;
export const ASSISTANT_WIDGET_MARGIN = 18;
export const ASSISTANT_AVOID_GAP = 12;

const DEFAULT_SIZE: AssistantSize = {
  width: ASSISTANT_WIDGET_WIDTH,
  height: ASSISTANT_WIDGET_HEIGHT,
};

export function clampAssistantPosition(
  position: AssistantPosition,
  viewport: AssistantViewport,
  size: AssistantSize = DEFAULT_SIZE,
): AssistantPosition {
  const maxX = Math.max(
    ASSISTANT_WIDGET_MARGIN,
    viewport.width - size.width - ASSISTANT_WIDGET_MARGIN,
  );
  const maxY = Math.max(
    ASSISTANT_WIDGET_MARGIN,
    viewport.height - size.height - ASSISTANT_WIDGET_MARGIN,
  );
  return {
    x: Math.min(Math.max(ASSISTANT_WIDGET_MARGIN, position.x), maxX),
    y: Math.min(Math.max(ASSISTANT_WIDGET_MARGIN, position.y), maxY),
  };
}

export function assistantPositionRect(
  position: AssistantPosition,
  size: AssistantSize = DEFAULT_SIZE,
): AssistantRect {
  return {
    left: position.x,
    top: position.y,
    right: position.x + size.width,
    bottom: position.y + size.height,
  };
}

export function assistantRectsOverlap(a: AssistantRect, b: AssistantRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Produit des positions de repli autour de la position courante, puis des
 * ancrages de sécurité dans les coins. La position courante reste prioritaire.
 */
export function buildAssistantCandidates(
  current: AssistantPosition,
  viewport: AssistantViewport,
  size: AssistantSize = DEFAULT_SIZE,
): AssistantPosition[] {
  const origin = clampAssistantPosition(current, viewport, size);
  const horizontalStep = size.width + ASSISTANT_AVOID_GAP;
  const verticalStep = size.height + ASSISTANT_AVOID_GAP;
  const rawCandidates: AssistantPosition[] = [
    origin,
    { x: origin.x, y: origin.y - verticalStep },
    { x: origin.x - horizontalStep, y: origin.y },
    { x: origin.x + horizontalStep, y: origin.y },
    { x: origin.x, y: origin.y + verticalStep },
    { x: origin.x - horizontalStep, y: origin.y - verticalStep },
    { x: origin.x + horizontalStep, y: origin.y - verticalStep },
    { x: origin.x - horizontalStep, y: origin.y + verticalStep },
    { x: origin.x + horizontalStep, y: origin.y + verticalStep },
  ];

  const margin = ASSISTANT_WIDGET_MARGIN;
  rawCandidates.push(
    { x: margin, y: margin },
    { x: viewport.width - size.width - margin, y: margin },
    { x: margin, y: viewport.height - size.height - margin },
    {
      x: viewport.width - size.width - margin,
      y: viewport.height - size.height - margin,
    },
    { x: (viewport.width - size.width) / 2, y: margin },
    { x: (viewport.width - size.width) / 2, y: viewport.height - size.height - margin },
  );

  const seen = new Set<string>();
  const candidates: AssistantPosition[] = [];
  for (const raw of rawCandidates) {
    const candidate = clampAssistantPosition(raw, viewport, size);
    const key = `${candidate.x}:${candidate.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

export function chooseAssistantPosition(
  current: AssistantPosition,
  candidates: AssistantPosition[],
  isClear: (position: AssistantPosition) => boolean,
): AssistantPosition {
  if (isClear(current)) return current;
  for (const candidate of candidates) {
    if (candidate.x === current.x && candidate.y === current.y) continue;
    if (isClear(candidate)) return candidate;
  }
  return current;
}
