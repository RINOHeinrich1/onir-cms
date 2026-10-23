/**
 * Contexte tenant (ADR-0025) — constante partagée migration/application.
 * L'organisation n'est JAMAIS fournie par le client : elle est résolue depuis
 * la session authentifiée (ou, pour le parcours public, depuis le lien).
 */

/** Organisation legacy `Onirtech` créée par la migration 0023. */
export const LEGACY_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000025";

/** Contexte tenant explicite traversant les couches. */
export type TenantContext = {
  organizationId: string;
};

/** Construit un contexte tenant à partir d'un identifiant résolu. */
export function tenantOf(organizationId: string): TenantContext {
  return { organizationId };
}
