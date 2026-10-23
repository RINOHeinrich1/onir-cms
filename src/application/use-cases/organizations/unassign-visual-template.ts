import { type Actor, assertSuperAdmin } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";

export type UnassignVisualTemplateDependencies = {
  organizations: OrganizationRepository;
  templates: VisualTemplateRepository;
};

/**
 * ADR-0025 §6 — retrait d'un template visuel d'une organisation.
 * Super-admin uniquement. Le retrait ne casse pas les liens existants : ils
 * continuent de résoudre le template par identifiant ; il n'est simplement plus
 * proposé pour les nouveaux liens.
 */
export async function unassignVisualTemplate(
  deps: UnassignVisualTemplateDependencies,
  actor: Actor,
  organizationId: string,
  templateId: string,
): Promise<void> {
  assertSuperAdmin(actor);

  const organization = await deps.organizations.findById(organizationId);
  if (organization === null) {
    throw new NotFoundError("Organisation introuvable");
  }
  const template =
    (await deps.templates.findAssignedById(organizationId, templateId)) ??
    (await deps.templates.findById(templateId));
  if (template === null) {
    throw new NotFoundError("Template visuel introuvable");
  }

  await deps.templates.unassign(organizationId, templateId);
}
