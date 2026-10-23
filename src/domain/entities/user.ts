/**
 * Entité métier `User` (A017) — isolée du framework et de la persistance.
 * Ne porte JAMAIS de secret (le hash de mot de passe reste dans l'infrastructure).
 *
 * ADR-0025 : `role` est LEGACY (conservé pour compatibilité/affichage) ;
 * l'autorisation utilise le rôle de la membership active (`organization_members`).
 * `isSuperAdmin` est un flag plateforme, indépendant des organisations.
 */

export const ROLES = ["admin", "marketeur", "lecteur"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Convertit une valeur brute (ex. colonne SQL) en rôle valide, sinon échoue. */
export function parseRole(value: string): Role {
  if (!isRole(value)) {
    throw new Error(`Rôle inconnu : ${value}`);
  }
  return value;
}

export type User = {
  id: string;
  email: string;
  /** Nom affiché, saisi par l'invité (nullable pour les comptes historiques). */
  name?: string | null;
  /** LEGACY (ADR-0025) : n'autorise plus ; voir la membership active. */
  role: Role;
  /** Super-admin plateforme : crée/suspend les organisations, bascule partout. */
  isSuperAdmin: boolean;
  /** Dernière organisation utilisée (choix au login). */
  lastActiveOrganizationId: string | null;
  mustChangePassword: boolean;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Normalisation d'email : trim + minuscules (unicité insensible à la casse). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Libellé humain d'un utilisateur : nom saisi, sinon email. Jamais l'UUID. */
export function displayUserName(user: Pick<User, "email"> & { name?: string | null }): string {
  const name = user.name?.trim() ?? "";
  return name === "" ? user.email : name;
}
