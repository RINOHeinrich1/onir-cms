/**
 * Entité `Category` — taxonomie partagée par organisation (ADR-0027).
 * La clé de rattachement des contenus est toujours `category_id` (scalaire) ;
 * le libellé n'est qu'une colonne d'affichage.
 */

export const CATEGORY_LABEL_MAX = 80;
export const CATEGORY_DESCRIPTION_MAX = 500;
export const CATEGORY_SLUG_MAX = 80;

export type Category = {
  id: string;
  organizationId: string;
  label: string;
  slug: string;
  description: string;
  actif: boolean;
  position: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Slug stable : minuscules, accents retirés, séparateurs `-`. */
export function categorySlug(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base === "" ? "categorie" : base).slice(0, CATEGORY_SLUG_MAX);
}

export function isCategorySlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= CATEGORY_SLUG_MAX;
}
