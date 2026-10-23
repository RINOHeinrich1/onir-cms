import { describe, expect, it, vi } from "vitest";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import { createOrganization } from "@/application/use-cases/organizations/create-organization";
import { listOrganizations } from "@/application/use-cases/organizations/list-organizations";
import { suspendOrganization } from "@/application/use-cases/organizations/suspend-organization";
import type { Organization } from "@/domain/entities/organization";
import type { User } from "@/domain/entities/user";

const SUPER = {
  id: "super-1",
  role: "admin" as const,
  organizationId: "org-1",
  isSuperAdmin: true,
};
const ADMIN = {
  id: "admin-1",
  role: "admin" as const,
  organizationId: "org-1",
  isSuperAdmin: false,
};

function organization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-new",
    name: "Nouvelle",
    suspendedAt: null,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function user(email = "boss@example.com"): User {
  return {
    id: "super-1",
    email,
    role: "admin",
    isSuperAdmin: true,
    lastActiveOrganizationId: "org-1",
    mustChangePassword: false,
    actif: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function orgRepo(overrides: Partial<OrganizationRepository> = {}) {
  const provision = vi.fn(async () => undefined);
  const repo: OrganizationRepository = {
    create: vi.fn(async (input) => organization({ name: input.name })),
    findById: async () => organization(),
    findByName: async () => null,
    listAll: async () => [organization()],
    listForUser: async () => [organization()],
    rename: async () => null,
    setSuspended: vi.fn(async (_id, suspended) =>
      organization({ suspendedAt: suspended ? new Date(0).toISOString() : null }),
    ),
    provisionDefaults: provision,
    ...overrides,
  };
  return { repo, provision };
}

function userRepo(): UserRepository {
  return {
    findById: async () => ({
      ...user(),
      passwordHash: "hash",
    }),
    findByEmail: async () => null,
    list: async () => [user()],
    listAll: async () => [user()],
    create: async () => user(),
    update: async () => user(),
    delete: async () => true,
    updateLastOrganization: async () => undefined,
    countSuperAdmins: async () => 1,
  };
}

describe("organisations — création, liste, suspension (ADR-0025 §5/§7)", () => {
  it("super-admin crée une organisation, nom par défaut = partie locale de l'email, puis provisionne", async () => {
    const { repo, provision } = orgRepo();
    const created = await createOrganization({ organizations: repo, users: userRepo() }, SUPER, {
      name: "  ",
    });
    expect(created.id).toBe("org-new");
    expect(repo.create).toHaveBeenCalledWith({ name: "boss", createdBy: "super-1" });
    expect(provision).toHaveBeenCalledWith("org-new");
  });

  it("un admin d'organisation ne peut pas créer d'organisation", async () => {
    const { repo } = orgRepo();
    await expect(
      createOrganization({ organizations: repo, users: userRepo() }, ADMIN, { name: "X" }),
    ).rejects.toThrow(/super-administrateur/i);
  });

  it("liste : super-admin = toutes ; sinon memberships", async () => {
    const all = vi.fn(async () => [organization({ id: "a" }), organization({ id: "b" })]);
    const mine = vi.fn(async () => [organization({ id: "a" })]);
    const { repo } = orgRepo({ listAll: all, listForUser: mine });
    expect(await listOrganizations({ organizations: repo }, SUPER)).toHaveLength(2);
    expect(await listOrganizations({ organizations: repo }, ADMIN)).toHaveLength(1);
  });

  it("suspension réservée au super-admin", async () => {
    const { repo } = orgRepo();
    const suspended = await suspendOrganization({ organizations: repo }, SUPER, "org-new");
    expect(suspended.suspendedAt).not.toBeNull();
    await expect(suspendOrganization({ organizations: repo }, ADMIN, "org-new")).rejects.toThrow(
      /super-administrateur/i,
    );
  });
});
