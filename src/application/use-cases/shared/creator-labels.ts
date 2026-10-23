import type { CreatorNameRepository } from "@/application/ports/creator-name-repository";
import { displayUserName } from "@/domain/entities/user";

export type WithCreatorLabel<T> = T & { createdByLabel: string | null };

export async function attachCreatorLabels<T extends { createdBy: string | null }>(
  items: readonly T[],
  creators: CreatorNameRepository,
): Promise<WithCreatorLabel<T>[]> {
  const ids = [
    ...new Set(
      items
        .map((item) => item.createdBy)
        .filter((id): id is string => id !== null && id.trim() !== ""),
    ),
  ];
  const names = ids.length === 0 ? [] : await creators.listByIds(ids);
  const labels = new Map(names.map((creator) => [creator.id, displayUserName(creator)]));
  return items.map((item) => ({
    ...item,
    createdByLabel:
      item.createdBy === null || item.createdBy.trim() === ""
        ? null
        : (labels.get(item.createdBy) ?? null),
  }));
}
