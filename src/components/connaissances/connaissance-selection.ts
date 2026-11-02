/** Helpers de sélection multiple de la liste des connaissances. */

export type SelectionState = "none" | "partial" | "all";

/** État du maître « tout sélectionner » pour les éléments visibles uniquement. */
export function selectionState(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
): SelectionState {
  if (visibleIds.length === 0) return "none";
  const selected = new Set(selectedIds);
  const selectedCount = visibleIds.filter((id) => selected.has(id)).length;
  if (selectedCount === 0) return "none";
  return selectedCount === visibleIds.length ? "all" : "partial";
}

/**
 * Sélectionne tous les éléments visibles, ou les désélectionne s'ils le sont déjà.
 * Les éléments hors filtre ne sont jamais modifiés par cette action.
 */
export function toggleVisibleSelection(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
): string[] {
  if (visibleIds.length === 0) return [...selectedIds];
  const visible = new Set(visibleIds);
  if (selectionState(selectedIds, visibleIds) === "all") {
    return selectedIds.filter((id) => !visible.has(id));
  }
  return [...new Set([...selectedIds, ...visibleIds])];
}

/** Retire de la sélection les identifiants qui ne sont plus présents dans la liste. */
export function pruneSelection(
  selectedIds: readonly string[],
  existingIds: readonly string[],
): string[] {
  const existing = new Set(existingIds);
  return selectedIds.filter((id) => existing.has(id));
}
