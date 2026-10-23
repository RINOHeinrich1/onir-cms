import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, ValidationError } from "@/application/errors";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import type { MemberDto } from "@/application/use-cases/organizations/manage-members";
import { normalizeEmail, type Role } from "@/domain/entities/user";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/domain/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateUserCommand = {
  email: string;
  password: string;
  role: Role;
  actif?: boolean;
};

export type CreateUserDependencies = {
  users: UserRepository;
  memberships: MembershipRepository;
};

/**
 * US-USERS-001 / ADR-0025 §3 — création d'un utilisateur dans l'organisation
 * active : le compte est global, le rôle est porté par la membership.
 * `users.role` reste un miroir legacy (affichage/compatibilité).
 */
export async function createUser(
  deps: CreateUserDependencies,
  actor: Actor,
  input: CreateUserCommand,
): Promise<MemberDto> {
  assertCan(actor, "users:create");
  const organizationId = organizationOf(actor);

  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError("Adresse email invalide");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`,
    );
  }

  const existing = await deps.users.findByEmail(email);
  if (existing !== null) {
    throw new ConflictError("Un utilisateur avec cet email existe déjà");
  }

  const user = await deps.users.create({
    email,
    passwordHash: hashPassword(input.password),
    role: input.role,
    mustChangePassword: true,
    actif: actor.isSuperAdmin ? (input.actif ?? true) : true,
  });

  try {
    const membership = await deps.memberships.upsert({
      organizationId,
      userId: user.id,
      role: input.role,
      createdBy: actor.id,
    });
    return {
      userId: user.id,
      email: user.email,
      role: membership.role,
      isSuperAdmin: user.isSuperAdmin,
      actif: user.actif,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    };
  } catch (error) {
    await deps.users.delete(user.id);
    throw error;
  }
}
