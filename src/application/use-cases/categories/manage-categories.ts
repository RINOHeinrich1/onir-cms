import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import {
  CATEGORY_CONTENT_TYPES,
  type CategoryContentType,
  type CategoryRepository,
  isCategoryContentType,
} from "@/application/ports/category-repository";
import {
  CATEGORY_DESCRIPTION_MAX,
  CATEGORY_LABEL_MAX,
  categorySlug,
  isCategorySlug,
} from "@/domain/entities/category";

export type CategoryDependencies = { categories: CategoryRepository };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sourceOf(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function labelOf(source: Record<string, unknown>): string {
  return typeof source.label === "string" ? source.label.trim() : "";
}

function descriptionOf(source: Record<string, unknown>): string {
  return typeof source.description === "string" ? source.description.trim() : "";
}

function positionOf(source: Record<string, unknown>): number {
  const value = source.position;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return 0;
  return Math.min(10_000, value);
}

function validateLabel(label: string): string {
  if (label === "") throw new ValidationError("Le libellé est obligatoire");
  if (label.length > CATEGORY_LABEL_MAX) {
    throw new ValidationError(`Libellé trop long (${CATEGORY_LABEL_MAX} caractères maximum)`);
  }
  return label;
}

function validateDescription(description: string): string {
  if (description.length > CATEGORY_DESCRIPTION_MAX) {
    throw new ValidationError(
      `Description trop longue (${CATEGORY_DESCRIPTION_MAX} caractères maximum)`,
    );
  }
  return description;
}

function validateSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!isCategorySlug(slug)) {
    throw new ValidationError("Slug invalide (minuscules, chiffres et tirets)");
  }
  return slug;
}

export async function listCategories(deps: CategoryDependencies, actor: Actor) {
  assertCan(actor, "categories:list");
  return deps.categories.list(organizationOf(actor));
}

export async function createCategory(deps: CategoryDependencies, actor: Actor, input: unknown) {
  assertCan(actor, "categories:create");
  const organizationId = organizationOf(actor);
  const source = sourceOf(input);
  const label = validateLabel(labelOf(source));
  const description = validateDescription(descriptionOf(source));
  const slug = validateSlug(
    typeof source.slug === "string" && source.slug.trim() !== ""
      ? source.slug
      : categorySlug(label),
  );
  if ((await deps.categories.findByLabel(organizationId, label)) !== null) {
    throw new ConflictError(`Catégorie déjà utilisée : ${label}`);
  }
  try {
    return await deps.categories.create(organizationId, {
      label,
      slug,
      description,
      actif: source.actif !== false,
      position: positionOf(source),
      createdBy: actor.id,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ConflictError("Libellé ou slug déjà utilisé");
    }
    throw error;
  }
}

export async function updateCategory(
  deps: CategoryDependencies,
  actor: Actor,
  id: string,
  input: unknown,
) {
  assertCan(actor, "categories:update");
  const organizationId = organizationOf(actor);
  const existing = await deps.categories.findById(organizationId, id);
  if (existing === null) throw new NotFoundError("Catégorie introuvable");
  const source = sourceOf(input);
  const patch: {
    label?: string;
    slug?: string;
    description?: string;
    actif?: boolean;
    position?: number;
  } = {};
  if ("label" in source) {
    const label = validateLabel(labelOf(source));
    if (label.toLowerCase() !== existing.label.toLowerCase()) {
      const homonym = await deps.categories.findByLabel(organizationId, label);
      if (homonym !== null && homonym.id !== id) {
        throw new ConflictError(`Catégorie déjà utilisée : ${label}`);
      }
    }
    patch.label = label;
  }
  if ("slug" in source) {
    patch.slug = validateSlug(
      typeof source.slug === "string" && source.slug.trim() !== ""
        ? source.slug
        : categorySlug(patch.label ?? existing.label),
    );
  }
  if ("description" in source) patch.description = validateDescription(descriptionOf(source));
  if ("actif" in source) patch.actif = source.actif !== false;
  if ("position" in source) patch.position = positionOf(source);
  try {
    return await deps.categories.update(organizationId, id, patch);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ConflictError("Libellé ou slug déjà utilisé");
    }
    throw error;
  }
}

export async function deleteCategory(
  deps: CategoryDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "categories:delete");
  const deleted = await deps.categories.delete(organizationOf(actor), id);
  if (!deleted) throw new NotFoundError("Catégorie introuvable");
}

function contentTypeOf(value: unknown): CategoryContentType {
  if (typeof value !== "string" || !isCategoryContentType(value)) {
    throw new ValidationError(`Type de contenu inconnu (${CATEGORY_CONTENT_TYPES.join(", ")})`);
  }
  return value;
}

function contentIdOf(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new ValidationError("Identifiant de contenu invalide");
  return id;
}

export async function listCategoryAssignments(
  deps: CategoryDependencies,
  actor: Actor,
  contentType: unknown,
  contentId: unknown,
) {
  assertCan(actor, "categories:list");
  return deps.categories.listForContent(
    organizationOf(actor),
    contentTypeOf(contentType),
    contentIdOf(contentId),
  );
}

export async function setCategoryAssignments(
  deps: CategoryDependencies,
  actor: Actor,
  input: unknown,
) {
  assertCan(actor, "categories:assign");
  const source = sourceOf(input);
  const contentType = contentTypeOf(source.contentType);
  const contentId = contentIdOf(source.contentId);
  const raw = source.categoryIds;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) {
    throw new ValidationError("categoryIds : tableau d'identifiants attendu");
  }
  const categoryIds = [...new Set(raw)] as string[];
  if (categoryIds.length > 50) throw new ValidationError("50 catégories maximum");
  if (categoryIds.some((id) => !UUID.test(id))) {
    throw new ValidationError("Identifiant de catégorie invalide");
  }
  return deps.categories.setForContent(organizationOf(actor), contentType, contentId, categoryIds);
}
