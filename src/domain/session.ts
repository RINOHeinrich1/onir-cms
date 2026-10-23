/**
 * Constantes de session (aucune dépendance Node) — importables par le
 * middleware Edge comme par le serveur Node.
 */

/** Nom du cookie de session (partagé middleware / serveur). */
export const SESSION_COOKIE = "onirtech_session";

/** Durée de vie d'une session : 7 jours. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * État « aucune organisation » (ADR-0025 §4) : l'utilisateur authentifié n'a
 * aucune membership (et n'est pas super-admin) ; il est dirigé vers cette page.
 */
export const NO_ORGANIZATION_PATH = "/no-organization";

/** Session applicative : l'organisation active est portée côté serveur. */
export type SessionContext = {
  userId: string;
  activeOrganizationId: string | null;
};
