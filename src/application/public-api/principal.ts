import type { Actor } from "@/application/actor";
import { ForbiddenError } from "@/application/errors";
import type { ApiKeyScope } from "@/domain/entities/api-key";

export type PublicApiPrincipal = {
  apiKeyId: string;
  organizationId: string;
  organizationName: string;
  createdBy: string | null;
  scopes: ApiKeyScope[];
};

export function hasScope(principal: PublicApiPrincipal, scope: ApiKeyScope): boolean {
  return principal.scopes.includes(scope);
}

export function assertScope(principal: PublicApiPrincipal, scope: ApiKeyScope): void {
  if (!hasScope(principal, scope)) {
    throw new ForbiddenError(`Scope ${scope} requis`);
  }
}

/** Acteur de lecture pour les cas d'usage qui n'utilisent pas l'identité. */
export function readActor(principal: PublicApiPrincipal): Actor {
  return {
    id: principal.apiKeyId,
    role: "admin",
    organizationId: principal.organizationId,
    isSuperAdmin: false,
  };
}
