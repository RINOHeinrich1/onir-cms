export const NO_CREATOR = "__none__";

export type CreatorOption = {
  id: string;
  label: string;
};

export type CreatorFilterable = {
  createdBy: string | null;
  createdByLabel: string | null;
};

export function creatorOptions(items: readonly CreatorFilterable[]): CreatorOption[] {
  const byId = new Map<string, string>();
  for (const item of items) {
    if (item.createdBy === null || item.createdBy.trim() === "") continue;
    const label = item.createdByLabel?.trim();
    byId.set(item.createdBy, label === undefined || label === "" ? "Utilisateur inconnu" : label);
  }
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "fr"));
}

export function hasUnassignedCreator(items: readonly CreatorFilterable[]): boolean {
  return items.some((item) => item.createdBy === null || item.createdBy.trim() === "");
}

export function matchesCreator(item: CreatorFilterable, filter: string | null): boolean {
  if (filter === null) return true;
  if (filter === NO_CREATOR) return item.createdBy === null || item.createdBy.trim() === "";
  return item.createdBy === filter;
}
