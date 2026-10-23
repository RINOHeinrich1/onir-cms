/**
 * Seed du compte administrateur par défaut (A016, US-AUTH-001, ADR-0025 §8).
 * Le mot de passe est HASHÉ (scrypt) — jamais stocké en clair — et la rotation
 * est forcée (`must_change_password = true`) à la première connexion.
 * Le compte est super-admin et reçoit une membership `admin` sur `Onirtech`
 * ainsi que sur son organisation personnelle provisionnée.
 *
 * CLI : `npm run db:seed` (via `seed-admin.cli.ts`).
 */

import { defaultOrganizationName } from "@/domain/entities/organization";
import { normalizeEmail } from "@/domain/entities/user";
import { hashPassword } from "@/domain/password";
import { defaultAdmin } from "@/lib/env";
import { pgMembershipRepository } from "./membership-repository";
import { pgOrganizationRepository } from "./organization-repository";
import { getPool } from "./pool";
import { pgUserRepository } from "./user-repository";

export type SeedAdminResult = {
  created: boolean;
  email: string;
};

export async function seedAdmin(): Promise<SeedAdminResult> {
  const { email, password } = defaultAdmin();
  const normalized = normalizeEmail(email);
  const pool = getPool();
  const users = pgUserRepository(pool);

  const existing = await users.findByEmail(normalized);
  if (existing !== null) {
    return { created: false, email: normalized };
  }

  const organizations = pgOrganizationRepository(pool);
  const memberships = pgMembershipRepository(pool);

  const legacy =
    (await organizations.findByName("Onirtech")) ??
    (await organizations.create({ name: "Onirtech", createdBy: null }));

  const user = await users.create({
    email: normalized,
    passwordHash: hashPassword(password),
    role: "admin",
    mustChangePassword: true,
    actif: true,
    isSuperAdmin: true,
  });

  await memberships.upsert({
    organizationId: legacy.id,
    userId: user.id,
    role: "admin",
    createdBy: user.id,
  });

  const personalName = defaultOrganizationName(normalized);
  const personal =
    (await organizations.findByName(personalName)) ??
    (await organizations.create({ name: personalName, createdBy: user.id }));
  if (personal.id !== legacy.id) {
    await memberships.upsert({
      organizationId: personal.id,
      userId: user.id,
      role: "admin",
      createdBy: user.id,
    });
    await organizations.provisionDefaults(personal.id);
  }

  await users.updateLastOrganization(user.id, legacy.id);
  return { created: true, email: normalized };
}
