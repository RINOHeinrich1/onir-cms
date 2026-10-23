import type { Category } from "@/domain/entities/category";

export type CategoryListItem = Category & { createdByLabel: string | null };
