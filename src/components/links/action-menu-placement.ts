export type ActionMenuPlacement = "top" | "bottom";

export interface ActionMenuPlacementInput {
  top: number;
  bottom: number;
  panelHeight: number;
  viewportHeight: number;
  margin?: number;
}

export interface ActionMenuPlacementResult {
  placement: ActionMenuPlacement;
  maxHeight: number;
}

export function resolveActionMenuPlacement({
  top,
  bottom,
  panelHeight,
  viewportHeight,
  margin = 12,
}: ActionMenuPlacementInput): ActionMenuPlacementResult {
  const spaceBelow = Math.max(0, viewportHeight - bottom - margin);
  const spaceAbove = Math.max(0, top - margin);
  const placement: ActionMenuPlacement =
    spaceBelow < panelHeight && spaceAbove > spaceBelow ? "top" : "bottom";
  const available = placement === "top" ? spaceAbove : spaceBelow;

  return {
    placement,
    maxHeight: Math.max(0, Math.floor(Math.min(panelHeight, available))),
  };
}
