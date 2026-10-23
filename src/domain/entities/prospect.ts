/**
 * Entité métier `Prospect` (B002) — isolée du framework et de la persistance.
 * RM-PROSPECT-001 : nom, prénom, nature physique/morale, email, activité,
 * fonction, autre détail.
 */

export const NATURES_PROSPECT = ["physique", "morale"] as const;

export type NatureProspect = (typeof NATURES_PROSPECT)[number];

export function isNatureProspect(value: string): value is NatureProspect {
  return (NATURES_PROSPECT as readonly string[]).includes(value);
}

/** Convertit une valeur brute (ex. colonne SQL) en nature valide, sinon échoue. */
export function parseNatureProspect(value: string): NatureProspect {
  if (!isNatureProspect(value)) {
    throw new Error(`Nature de prospect inconnue : ${value}`);
  }
  return value;
}

export const ORIGINES_PROSPECT = ["saisie", "libre"] as const;

export type OrigineProspect = (typeof ORIGINES_PROSPECT)[number];

export function isOrigineProspect(value: string): value is OrigineProspect {
  return (ORIGINES_PROSPECT as readonly string[]).includes(value);
}

/** Convertit une valeur brute (ex. colonne SQL) en origine valide, sinon échoue. */
export function parseOrigineProspect(value: string): OrigineProspect {
  if (!isOrigineProspect(value)) {
    throw new Error(`Origine de prospect inconnue : ${value}`);
  }
  return value;
}

/** Filtre d'origine : prospect manuel (`saisie`) ou lien de chat précis. */
export type ProspectOriginFilter = { kind: "manuel" } | { kind: "lien"; label: string };

/** Parse `?origine=manuel` ou `?origine=lien:<libellé>` (null = tous). */
export function parseProspectOriginFilter(value: unknown): ProspectOriginFilter | null {
  if (value === "manuel") return { kind: "manuel" };
  if (typeof value === "string" && value.startsWith("lien:")) {
    return { kind: "lien", label: value.slice("lien:".length) };
  }
  return null;
}

/** Sérialise un filtre d'origine pour l'URL / le select. */
export function prospectOriginFilterValue(filter: ProspectOriginFilter | null): string | null {
  if (filter === null) return null;
  return filter.kind === "manuel" ? "manuel" : `lien:${filter.label}`;
}

export type Prospect = {
  id: string;
  organizationId: string;
  nom: string;
  prenom: string;
  nature: NatureProspect;
  email: string;
  activite: string;
  fonction: string;
  detail: string;
  /** Origine : `saisie` (créé à la main) ou `libre` (issu d'un lien de chat). */
  origine: OrigineProspect;
  /** Lien de chat d'entrée (prospects `libre`), sinon null. */
  lienId: string | null;
  /** Libellé du lien d'entrée (modèle de lecture, sinon null). */
  lienLabel: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};
