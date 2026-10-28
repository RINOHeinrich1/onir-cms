import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import { type MemberDto, toMember } from "@/application/use-cases/organizations/manage-members";

export type ListUsersDependencies = {
  users: UserRepository;
  memberships: MembershipRepository;
  operatorScopes?: ChatOperatorScopeRepository;
};

/**
 * US-USERS-001 / ADR-0025 §5 — la page Utilisateurs est scoped : elle ne liste
 * que les membres de l'organisation active (jamais les comptes globaux).
 */
export async function listUsers(deps: ListUsersDependencies, actor: Actor): Promise<MemberDto[]> {
  assertCan(actor, "users:list");
  const organizationId = organizationOf(actor);

  const [memberships, users] = await Promise.all([
    deps.memberships.listForOrganization(organizationId),
    deps.users.listAll(),
  ]);
  const byId = new Map(users.map((user) => [user.id, user]));
  const members: MemberDto[] = [];
  for (const membership of memberships) {
    const user = byId.get(membership.userId);
    if (user === undefined) continue;
    const member = toMember(user, membership.role);
    if (member.role === "operateur" && deps.operatorScopes !== undefined) {
      member.chatScope = (await deps.operatorScopes.findForUser(organizationId, user.id)) ?? {
        allLinks: true,
        linkIds: [],
      };
    }
    members.push(member);
  }
  return members.sort((a, b) => a.email.localeCompare(b.email));
}
