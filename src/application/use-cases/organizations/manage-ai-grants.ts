import { type Actor, assertSuperAdmin } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type {
  AiGrantCatalog,
  AiGrantRepository,
  AiGrantSet,
  AiGrantTarget,
} from "@/application/ports/ai-grant-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";

export type AiGrantDependencies = {
  grants: AiGrantRepository;
  organizations: OrganizationRepository;
};

export type OrganizationAiGrants = {
  grants: AiGrantSet;
  catalog: AiGrantCatalog;
};

function parseTarget(raw: unknown): AiGrantTarget {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Cible de partage invalide");
  }
  const source = raw as Record<string, unknown>;
  const kind = source.kind;
  if (kind === "provider") {
    const providerId = typeof source.providerId === "string" ? source.providerId.trim() : "";
    if (providerId === "") throw new ValidationError("Fournisseur requis");
    return { kind: "provider", providerId };
  }
  if (kind === "model") {
    const providerId = typeof source.providerId === "string" ? source.providerId.trim() : "";
    const model = typeof source.model === "string" ? source.model.trim() : "";
    if (providerId === "" || model === "") {
      throw new ValidationError("Fournisseur et modèle requis");
    }
    return { kind: "model", providerId, model };
  }
  if (kind === "cluster") {
    const clusterId = typeof source.clusterId === "string" ? source.clusterId.trim() : "";
    if (clusterId === "") throw new ValidationError("Cluster requis");
    return { kind: "cluster", clusterId };
  }
  throw new ValidationError("Type de partage invalide");
}

async function requireOrganization(
  deps: AiGrantDependencies,
  organizationId: string,
): Promise<void> {
  const organization = await deps.organizations.findById(organizationId);
  if (organization === null) throw new NotFoundError("Organisation introuvable");
}

function requireTarget(catalog: AiGrantCatalog, target: AiGrantTarget): void {
  if (target.kind === "provider") {
    if (!catalog.providers.some((provider) => provider.id === target.providerId)) {
      throw new NotFoundError("Fournisseur introuvable");
    }
    return;
  }
  if (target.kind === "model") {
    const provider = catalog.providers.find((entry) => entry.id === target.providerId);
    if (
      provider === undefined ||
      !provider.models.some((model) => model.modelId === target.model)
    ) {
      throw new NotFoundError("Modèle introuvable");
    }
    return;
  }
  if (!catalog.clusters.some((cluster) => cluster.id === target.clusterId)) {
    throw new NotFoundError("Cluster introuvable");
  }
}

/** Catalogue complet et grants d'une organisation (super-admin). */
export async function getOrganizationAiGrants(
  deps: AiGrantDependencies,
  actor: Actor,
  organizationId: string,
): Promise<OrganizationAiGrants> {
  assertSuperAdmin(actor);
  await requireOrganization(deps, organizationId);
  const [catalog, grants] = await Promise.all([
    deps.grants.listCatalog(),
    deps.grants.listGrants(organizationId),
  ]);
  return { grants, catalog };
}

/** Ajoute un grant de fournisseur, modèle ou cluster (super-admin). */
export async function grantOrganizationAiAccess(
  deps: AiGrantDependencies,
  actor: Actor,
  organizationId: string,
  raw: unknown,
): Promise<OrganizationAiGrants> {
  assertSuperAdmin(actor);
  await requireOrganization(deps, organizationId);
  const target = parseTarget(raw);
  const catalog = await deps.grants.listCatalog();
  requireTarget(catalog, target);
  await deps.grants.grant(organizationId, target, actor.id);
  return { grants: await deps.grants.listGrants(organizationId), catalog };
}

/** Retire un grant (super-admin). */
export async function revokeOrganizationAiAccess(
  deps: AiGrantDependencies,
  actor: Actor,
  organizationId: string,
  raw: unknown,
): Promise<OrganizationAiGrants> {
  assertSuperAdmin(actor);
  await requireOrganization(deps, organizationId);
  const target = parseTarget(raw);
  if ((await deps.grants.countUsage(organizationId, target)) > 0) {
    throw new ConflictError(
      "Ce partage est utilisé par un chatbot, un défaut IA ou un override : détachez-le avant de le retirer",
    );
  }
  await deps.grants.revoke(organizationId, target);
  return {
    grants: await deps.grants.listGrants(organizationId),
    catalog: await deps.grants.listCatalog(),
  };
}
