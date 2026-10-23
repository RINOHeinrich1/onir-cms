import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { SessionRepository } from "@/application/ports/session-repository";
import { toPublicUser, type UserRepository } from "@/application/ports/user-repository";
import type { Membership, Organization } from "@/domain/entities/organization";
import { normalizeEmail, type Role, type User } from "@/domain/entities/user";
import { verifyPassword } from "@/domain/password";
import { SESSION_TTL_MS } from "@/domain/session";
import { createSessionToken, hashSessionToken } from "@/lib/session-token";

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginResult =
  | {
      ok: true;
      token: string;
      user: User;
      /** Organisation active choisie par le serveur (jamais le client). */
      activeOrganizationId: string | null;
      /** Rôle effectif pour l'organisation active. */
      role: Role | null;
      organizations: Organization[];
      mustChangePassword: boolean;
      expiresAt: Date;
    }
  | {
      ok: false;
      reason: "invalid_credentials" | "inactive";
    };

export type LoginDependencies = {
  users: UserRepository;
  sessions: SessionRepository;
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
};

/**
 * Choisit l'organisation active (ADR-0025 §4) : dernière organisation utilisée
 * si l'utilisateur en est membre et qu'elle n'est pas suspendue, sinon la
 * première membership non suspendue. `null` = état « aucune organisation ».
 */
async function resolveActiveOrganization(
  deps: LoginDependencies,
  user: User,
): Promise<{ organizationId: string | null; role: Role | null }> {
  const memberships = await deps.memberships.listForUser(user.id);
  const organizationIds = new Set(memberships.map((membership) => membership.organizationId));
  const organizations = await deps.organizations.listForUser(user.id);
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));

  const isUsable = (organizationId: string): boolean => {
    const organization = byId.get(organizationId);
    return organization !== undefined && organization.suspendedAt === null;
  };

  const preferred =
    user.lastActiveOrganizationId !== null &&
    organizationIds.has(user.lastActiveOrganizationId) &&
    isUsable(user.lastActiveOrganizationId)
      ? user.lastActiveOrganizationId
      : null;

  if (preferred !== null) {
    const membership = memberships.find((item) => item.organizationId === preferred);
    return { organizationId: preferred, role: membership?.role ?? null };
  }

  const first = memberships.find((membership: Membership) => isUsable(membership.organizationId));
  if (first !== undefined) {
    return { organizationId: first.organizationId, role: first.role };
  }

  // Super-admin sans membership utilisable : dernière org connue ou première org.
  if (user.isSuperAdmin) {
    const all = await deps.organizations.listAll();
    const fallback =
      all.find((organization) => organization.id === user.lastActiveOrganizationId) ?? all[0];
    if (fallback !== undefined) {
      return { organizationId: fallback.id, role: "admin" };
    }
  }
  return { organizationId: null, role: null };
}

/** US-AUTH-001 — authentification email + mot de passe, création de session. */
export async function login(deps: LoginDependencies, input: LoginInput): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const record = await deps.users.findByEmail(email);

  // Réponse indifférenciée (pas d'oracle sur l'existence du compte).
  if (record === null || !verifyPassword(input.password, record.passwordHash)) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (!record.actif) {
    return { ok: false, reason: "inactive" };
  }

  const user = toPublicUser(record);
  const active = await resolveActiveOrganization(deps, user);

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await deps.sessions.create({
    tokenHash: hashSessionToken(token),
    userId: record.id,
    activeOrganizationId: active.organizationId,
    expiresAt,
  });

  const organizations = user.isSuperAdmin
    ? await deps.organizations.listAll()
    : await deps.organizations.listForUser(user.id);

  return {
    ok: true,
    token,
    user,
    activeOrganizationId: active.organizationId,
    role: active.role,
    organizations,
    mustChangePassword: user.mustChangePassword,
    expiresAt,
  };
}
