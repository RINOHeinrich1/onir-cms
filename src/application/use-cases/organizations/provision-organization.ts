import type { OrganizationRepository } from "@/application/ports/organization-repository";

export type ProvisionOrganizationDependencies = {
  organizations: OrganizationRepository;
};

/**
 * ADR-0025 §7/§9 — provisionne une organisation vide : modèles de raisonnement
 * par défaut, politique de confidentialité par défaut et assignation de tous les
 * templates visuels. Idempotent (rejouable sans doublon).
 */
export async function provisionOrganization(
  deps: ProvisionOrganizationDependencies,
  organizationId: string,
): Promise<void> {
  await deps.organizations.provisionDefaults(organizationId);
}
