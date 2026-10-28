import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type {
  ChatOperatorScope,
  ChatOperatorScopeRepository,
} from "@/application/ports/chat-operator-scope-repository";
import type { MembershipRepository } from "@/application/ports/membership-repository";

export type ManageChatOperatorScopeDependencies = {
  scopes: ChatOperatorScopeRepository;
  memberships: MembershipRepository;
  links: ChatLinkRepository;
};

function assertOrganizationAccess(actor: Actor, organizationId: string): void {
  if (actor.isSuperAdmin) return;
  if (organizationOf(actor) !== organizationId) {
    throw new NotFoundError("Organisation introuvable");
  }
}

async function assertOperator(
  deps: ManageChatOperatorScopeDependencies,
  organizationId: string,
  userId: string,
): Promise<void> {
  const role = await deps.memberships.findRole(organizationId, userId);
  if (role === null) throw new NotFoundError("Membre introuvable");
  if (role !== "operateur") {
    throw new ValidationError("La portée par liens est réservée aux opérateurs chat");
  }
}

function parseScope(input: unknown): ChatOperatorScope {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  if (typeof source.allLinks !== "boolean") {
    throw new ValidationError("Le champ 'allLinks' (booléen) est requis");
  }
  if (source.allLinks) return { allLinks: true, linkIds: [] };
  if (!Array.isArray(source.linkIds)) {
    throw new ValidationError("Le champ 'linkIds' doit être un tableau");
  }
  const linkIds: string[] = [];
  const seen = new Set<string>();
  for (const value of source.linkIds) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    linkIds.push(id);
  }
  return { allLinks: false, linkIds };
}

export async function getChatOperatorScope(
  deps: ManageChatOperatorScopeDependencies,
  actor: Actor,
  organizationId: string,
  userId: string,
): Promise<ChatOperatorScope> {
  assertCan(actor, "members:list");
  assertOrganizationAccess(actor, organizationId);
  await assertOperator(deps, organizationId, userId);
  return (
    (await deps.scopes.findForUser(organizationId, userId)) ?? {
      allLinks: true,
      linkIds: [],
    }
  );
}

export async function setChatOperatorScope(
  deps: ManageChatOperatorScopeDependencies,
  actor: Actor,
  organizationId: string,
  userId: string,
  input: unknown,
): Promise<ChatOperatorScope> {
  assertCan(actor, "members:update");
  assertOrganizationAccess(actor, organizationId);
  await assertOperator(deps, organizationId, userId);
  const scope = parseScope(input);
  if (!scope.allLinks && scope.linkIds.length > 0) {
    const allowed = new Set((await deps.links.list(organizationId)).map((link) => link.id));
    const invalid = scope.linkIds.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      throw new ValidationError("Un ou plusieurs liens sont introuvables dans l'organisation");
    }
  }
  return deps.scopes.setForUser(organizationId, userId, scope);
}
