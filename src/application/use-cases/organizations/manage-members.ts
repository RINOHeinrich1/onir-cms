import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/application/errors";
import type { ChatOperatorScope } from "@/application/ports/chat-operator-scope-repository";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { SessionRepository } from "@/application/ports/session-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import type { MembershipRole } from "@/domain/entities/organization";
import { isRole, normalizeEmail, type Role, type User } from "@/domain/entities/user";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/domain/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Vue d'un membre de l'organisation active (jamais de secret). */
export type MemberDto = {
  userId: string;
  email: string;
  role: Role;
  isSuperAdmin: boolean;
  actif: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  /** Portée des conversations pour un opérateur chat (ADR-0043). */
  chatScope?: ChatOperatorScope | null;
};

export type ManageMembersDependencies = {
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
  users: UserRepository;
  sessions: SessionRepository;
};

/**
 * Garde d'accès à une organisation : un admin d'organisation ne peut agir que
 * sur la sienne ; le super-admin agit partout. Toute cible hors périmètre est
 * traitée comme inexistante (404) pour ne pas révéler son existence.
 */
function assertOrganizationAccess(actor: Actor, organizationId: string): void {
  if (actor.isSuperAdmin) return;
  if (organizationOf(actor) !== organizationId) {
    throw new NotFoundError("Organisation introuvable");
  }
}

async function assertOrganizationExists(
  deps: ManageMembersDependencies,
  organizationId: string,
): Promise<void> {
  const organization = await deps.organizations.findById(organizationId);
  if (organization === null) {
    throw new NotFoundError("Organisation introuvable");
  }
}

/** Garde « dernier admin » : refuse de laisser une organisation sans admin. */
async function assertNotLastAdmin(
  deps: ManageMembersDependencies,
  organizationId: string,
  userId: string,
): Promise<void> {
  const role = await deps.memberships.findRole(organizationId, userId);
  if (role !== "admin") return;
  const admins = await deps.memberships.countAdmins(organizationId);
  if (admins <= 1) {
    throw new ConflictError("Impossible de retirer le dernier administrateur de l'organisation");
  }
}

export function toMember(user: User, role: MembershipRole): MemberDto {
  return {
    userId: user.id,
    email: user.email,
    role,
    isSuperAdmin: user.isSuperAdmin,
    actif: user.actif,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

/** ADR-0025 §5 — membres d'une organisation (admin d'org ou super-admin). */
export async function listMembers(
  deps: ManageMembersDependencies,
  actor: Actor,
  organizationId: string,
): Promise<MemberDto[]> {
  assertCan(actor, "members:list");
  assertOrganizationAccess(actor, organizationId);
  await assertOrganizationExists(deps, organizationId);

  const [memberships, users] = await Promise.all([
    deps.memberships.listForOrganization(organizationId),
    deps.users.listAll(),
  ]);
  const byId = new Map(users.map((user) => [user.id, user]));
  const members: MemberDto[] = [];
  for (const membership of memberships) {
    const user = byId.get(membership.userId);
    if (user !== undefined) members.push(toMember(user, membership.role));
  }
  return members.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * ADR-0025 §5 — rattachement d'un utilisateur **existant**.
 * Super-admin : partout. Admin d'organisation : seulement un utilisateur qui
 * n'appartient encore à aucune autre organisation.
 */
export async function addExistingUser(
  deps: ManageMembersDependencies,
  actor: Actor,
  organizationId: string,
  input: { email: unknown; role: unknown },
): Promise<MemberDto> {
  assertCan(actor, "members:create");
  assertOrganizationAccess(actor, organizationId);
  await assertOrganizationExists(deps, organizationId);

  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  if (email === "") {
    throw new ValidationError("Email requis");
  }
  const role = parseMembershipRole(input.role);

  const user = await deps.users.findByEmail(email);
  if (user === null) {
    throw new NotFoundError("Utilisateur introuvable");
  }

  const target = await deps.memberships.findByOrganizationAndUser(organizationId, user.id);
  if (target !== null) {
    throw new ConflictError("Cet utilisateur est déjà membre de l'organisation");
  }

  if (!actor.isSuperAdmin) {
    const others = (await deps.memberships.listForUser(user.id)).filter(
      (membership) => membership.organizationId !== organizationId,
    );
    if (others.length > 0) {
      throw new ForbiddenError(
        "Un administrateur d'organisation ne peut pas rattacher un utilisateur déjà membre d'une autre organisation",
      );
    }
  }

  const membership = await deps.memberships.upsert({
    organizationId,
    userId: user.id,
    role,
    createdBy: actor.id,
  });
  // Miroir legacy d'affichage uniquement.
  await deps.users.update(user.id, { role });
  return toMember(user, membership.role);
}

/**
 * ADR-0025 §5 — création d'un utilisateur global + membership dans
 * l'organisation ciblée. Un email déjà utilisé exige le rattachement explicite.
 */
export async function createUserInOrganization(
  deps: ManageMembersDependencies,
  actor: Actor,
  organizationId: string,
  input: { email: unknown; password: unknown; role: unknown; actif?: unknown },
): Promise<MemberDto> {
  assertCan(actor, "members:create");
  assertOrganizationAccess(actor, organizationId);
  await assertOrganizationExists(deps, organizationId);

  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = parseMembershipRole(input.role);

  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError("Adresse email invalide");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`,
    );
  }
  const existing = await deps.users.findByEmail(email);
  if (existing !== null) {
    throw new ConflictError(
      "Un utilisateur avec cet email existe déjà : rattachez-le à l'organisation",
    );
  }

  const user = await deps.users.create({
    email,
    passwordHash: hashPassword(password),
    role,
    mustChangePassword: true,
    actif: actor.isSuperAdmin ? input.actif !== false : true,
  });
  try {
    await deps.memberships.upsert({
      organizationId,
      userId: user.id,
      role,
      createdBy: actor.id,
    });
  } catch (error) {
    // Pas de transaction inter-dépôts : nettoyage du compte orphelin.
    await deps.users.delete(user.id);
    throw error;
  }
  return toMember(user, role);
}

/** ADR-0025 §5 — changement de rôle d'un membre (garde dernier admin). */
export async function changeMemberRole(
  deps: ManageMembersDependencies,
  actor: Actor,
  organizationId: string,
  userId: string,
  roleInput: unknown,
): Promise<MemberDto> {
  assertCan(actor, "members:update");
  assertOrganizationAccess(actor, organizationId);

  const membership = await deps.memberships.findByOrganizationAndUser(organizationId, userId);
  if (membership === null) {
    throw new NotFoundError("Membre introuvable");
  }
  const role = parseMembershipRole(roleInput);
  if (membership.role === "admin" && role !== "admin") {
    await assertNotLastAdmin(deps, organizationId, userId);
  }

  const updated = await deps.memberships.updateRole(organizationId, userId, role);
  if (updated === null) {
    throw new NotFoundError("Membre introuvable");
  }
  await deps.users.update(userId, { role });

  const user = await deps.users.findById(userId);
  if (user === null) {
    throw new NotFoundError("Utilisateur introuvable");
  }
  return toMember(user, updated.role);
}

/**
 * ADR-0025 §5/H5 — retrait d'un membre = suppression de la membership.
 * Le compte global n'est jamais supprimé ; ses sessions sont révoquées
 * seulement s'il ne lui reste plus aucune organisation.
 */
export async function removeMember(
  deps: ManageMembersDependencies,
  actor: Actor,
  organizationId: string,
  userId: string,
): Promise<void> {
  assertCan(actor, "members:delete");
  assertOrganizationAccess(actor, organizationId);

  const membership = await deps.memberships.findByOrganizationAndUser(organizationId, userId);
  if (membership === null) {
    throw new NotFoundError("Membre introuvable");
  }
  await assertNotLastAdmin(deps, organizationId, userId);
  await deps.memberships.remove(organizationId, userId);

  const remaining = await deps.memberships.countForUser(userId);
  if (remaining === 0) {
    await deps.sessions.deleteByUser(userId);
  }
}

function parseMembershipRole(value: unknown): Role {
  const role = typeof value === "string" ? value.trim() : "";
  if (!isRole(role)) {
    throw new ValidationError("Rôle invalide (admin, marketeur, lecteur ou operateur)");
  }
  return role;
}
