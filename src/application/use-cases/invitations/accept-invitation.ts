import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/application/errors";
import type { InvitationRepository } from "@/application/ports/invitation-repository";
import type { SessionRepository } from "@/application/ports/session-repository";
import { normalizeEmail, type Role } from "@/domain/entities/user";
import { MIN_PASSWORD_LENGTH } from "@/domain/password";
import { SESSION_TTL_MS } from "@/domain/session";
import { hashInvitationToken } from "@/lib/invitation-token";
import { createSessionToken, hashSessionToken } from "@/lib/session-token";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;

export type AcceptInvitationCommand = {
  token: string;
  name: string;
  email: string;
  password: string;
};

export type AcceptInvitationDependencies = {
  invitations: InvitationRepository;
  sessions: SessionRepository;
};

export type AcceptInvitationResult = {
  token: string;
  expiresAt: Date;
  organizationId: string;
  organizationName: string;
  role: Role;
  mustChangePassword: boolean;
};

/**
 * Acceptation publique d'un lien : crée ou authentifie le compte, rattache la
 * membership, crée l'organisation personnelle si l'invitation n'en porte pas,
 * puis ouvre une session. Aucun changement de rôle pour un membre existant.
 */
export async function acceptInvitation(
  deps: AcceptInvitationDependencies,
  input: AcceptInvitationCommand,
): Promise<AcceptInvitationResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);

  if (name.length < 2 || name.length > NAME_MAX) {
    throw new ValidationError(`Nom requis (${NAME_MAX} caractères maximum)`);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError("Adresse email invalide");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`,
    );
  }
  if (input.token.trim() === "" || input.token.length > 256) {
    throw new NotFoundError("Invitation invalide ou expirée");
  }

  const result = await deps.invitations.accept({
    tokenHash: hashInvitationToken(input.token),
    name,
    email,
    password: input.password,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "invalid":
      case "expired":
      case "revoked":
      case "already_accepted":
        throw new NotFoundError("Invitation invalide ou expirée");
      case "invalid_credentials":
        throw new UnauthorizedError("Email ou mot de passe incorrect");
      case "inactive":
        throw new ForbiddenError("Ce compte est désactivé");
      case "already_member":
        throw new ConflictError("Ce compte est déjà membre de cette organisation");
      case "organization_suspended":
        throw new ForbiddenError("Cette organisation est suspendue");
    }
  }

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await deps.sessions.create({
    tokenHash: hashSessionToken(token),
    userId: result.userId,
    activeOrganizationId: result.organizationId,
    expiresAt,
  });

  return {
    token,
    expiresAt,
    organizationId: result.organizationId,
    organizationName: result.organizationName,
    role: result.role,
    mustChangePassword: result.mustChangePassword,
  };
}
