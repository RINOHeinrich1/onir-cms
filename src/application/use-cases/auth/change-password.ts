import type { UserRepository } from "@/application/ports/user-repository";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/domain/password";

export type ChangePasswordInput = {
  userId: string;
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "inactive" | "invalid_current" | "weak_password" | "same_password";
    };

export type ChangePasswordDependencies = {
  users: UserRepository;
};

/**
 * Rotation forcée du mot de passe (US-AUTH-001).
 * Efface `must_change_password` en cas de succès : l'accès au dashboard est débloqué.
 */
export async function changePassword(
  deps: ChangePasswordDependencies,
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const record = await deps.users.findById(input.userId);
  if (record === null) return { ok: false, reason: "not_found" };
  if (!record.actif) return { ok: false, reason: "inactive" };
  if (!verifyPassword(input.currentPassword, record.passwordHash)) {
    return { ok: false, reason: "invalid_current" };
  }
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "weak_password" };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, reason: "same_password" };
  }

  await deps.users.update(record.id, {
    passwordHash: hashPassword(input.newPassword),
    mustChangePassword: false,
  });

  return { ok: true };
}
