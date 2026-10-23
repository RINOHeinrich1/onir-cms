import type { Category } from "@/domain/entities/category";

export const CATEGORY_CONTENT_TYPES = ["media", "connaissance", "link"] as const;
export type CategoryContentType = (typeof CATEGORY_CONTENT_TYPES)[number];

export function isCategoryContentType(value: string): value is CategoryContentType {
  return (CATEGORY_CONTENT_TYPES as readonly string[]).includes(value);
}

export type CreateCategoryInput = {
  label: string;
  slug: string;
  description: string;
  actif: boolean;
  position: number;
  createdBy: string | null;
};

export type UpdateCategoryInput = {
  label?: string;
  slug?: string;
  description?: string;
  actif?: boolean;
  position?: number;
};

export interface CategoryRepository {
  list(organizationId: string): Promise<Category[]>;
  findById(organizationId: string, id: string): Promise<Category | null>;
  findByLabel(organizationId: string, label: string): Promise<Category | null>;
  create(organizationId: string, input: CreateCategoryInput): Promise<Category>;
  update(organizationId: string, id: string, patch: UpdateCategoryInput): Promise<Category | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
  listForContent(
    organizationId: string,
    contentType: CategoryContentType,
    contentId: string,
  ): Promise<Category[]>;
  setForContent(
    organizationId: string,
    contentType: CategoryContentType,
    contentId: string,
    categoryIds: string[],
  ): Promise<Category[]>;
}
