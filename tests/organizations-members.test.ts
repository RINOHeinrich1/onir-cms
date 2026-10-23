import { describe, expect, it, vi } from "vitest";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { SessionRepository } from "@/application/ports/session-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import {
  addExistingUser,
  changeMemberRole,
  createUserInOrganization,
  removeMember,
} from "@/application/use-cases/organizations/manage-members";
import type { Membership } from "@/domain/entities/organization";
import type { User } from "@/domain/entities/user";

const ADMIN = {
  id: "admin-a",
  role: "admin" as const,
  organizationId: "org-a",
  isSuperAdmin: false,
};
const SUPER = {
  id: "super-1",
  role: "admin" as const,
  organizationId: "org-a",
  isSuperAdmin: true,
};

function user(id: string, email: string): User {
  return {
    id,
    email,
    role: "lecteur",
    isSuperAdmin: false,
    lastActiveOrganizationId: null,
    mustChangePassword: true,
    actif: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function organizationRepo(): OrganizationRepository {
  return {
    create: async () => {
      throw new Error("non utilisé");
    },
    findById: async (id) => ({
      id,
      name: id,
      suspendedAt: null,
      createdBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }),
    findByName: async () => null,
    listAll: async () => [],
    listForUser: async () => [],
    rename: async () => null,
    setSuspended: async () => null,
    provisionDefaults: async () => undefined,
  };
}

function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    organizationId: "org-a",
    userId: "u2",
    role: "lecteur",
    createdBy: "admin-a",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function deps(options: {
  memberships?: Partial<MembershipRepository>;
  users?: Partial<UserRepository>;
  sessions?: Partial<SessionRepository>;
}) {
  const users: UserRepository = {
    findById: async () => null,
    findByEmail: async () => null,
    list: async () => [],
    listAll: async () => [],
    create: vi.fn(async () => user("u-new", "new@example.com")),
    update: async () => null,
    delete: async () => true,
    updateLastOrganization: async () => undefined,
    countSuperAdmins: async () => 1,
    ...options.users,
  };
  const memberships: MembershipRepository = {
    findRole: async () => null,
    findByOrganizationAndUser: async () => null,
    listForUser: async () => [],
    listForOrganization: async () => [],
    upsert: vi.fn(async (input) => membership(input)),
    updateRole: vi.fn(async (_organizationId, userId, role) => membership({ userId, role })),
    remove: vi.fn(async () => true),
    countAdmins: async () => 2,
    countForUser: async () => 1,
    ...options.memberships,
  };
  const sessions: SessionRepository = {
    create: async () => {
      throw new Error("non utilisé");
    },
    findByTokenHash: async () => null,
    setActiveOrganization: async () => undefined,
    delete: async () => undefined,
    deleteByUser: vi.fn(async () => undefined),
    ...options.sessions,
  };
  return { organizations: organizationRepo(), memberships, users, sessions };
}

describe("memberships — ADR-0025 §5", () => {
  it("un admin d'organisation ne rattache pas un utilisateur d'une autre organisation", async () => {
    const d = deps({
      users: {
        findByEmail: async () => ({ ...user("u2", "u2@example.com"), passwordHash: "hash" }),
      },
      memberships: {
        listForUser: async () => [membership({ organizationId: "org-b" })],
      },
    });
    await expect(
      addExistingUser(d, ADMIN, "org-a", { email: "u2@example.com", role: "lecteur" }),
    ).rejects.toThrow(/déjà membre d'une autre organisation/i);
  });

  it("le super-admin peut rattacher un utilisateur déjà membre d'une autre organisation", async () => {
    const d = deps({
      users: {
        findByEmail: async () => ({ ...user("u2", "u2@example.com"), passwordHash: "hash" }),
      },
      memberships: {
        listForUser: async () => [membership({ organizationId: "org-b" })],
      },
    });
    const member = await addExistingUser(d, SUPER, "org-a", {
      email: "u2@example.com",
      role: "marketeur",
    });
    expect(member.userId).toBe("u2");
    expect(d.memberships.upsert).toHaveBeenCalled();
  });

  it("crée un utilisateur global + membership dans l'organisation", async () => {
    const d = deps({});
    const member = await createUserInOrganization(d, ADMIN, "org-a", {
      email: "new@example.com",
      password: "motdepasse123",
      role: "admin",
    });
    expect(member.email).toBe("new@example.com");
    expect(d.users.create).toHaveBeenCalled();
    expect(d.memberships.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a", role: "admin" }),
    );
  });

  it("refuse de retirer ou rétrograder le dernier admin", async () => {
    const d = deps({
      memberships: {
        findRole: async () => "admin",
        findByOrganizationAndUser: async () => membership({ role: "admin" }),
        countAdmins: async () => 1,
      },
    });
    await expect(removeMember(d, ADMIN, "org-a", "u2")).rejects.toThrow(/dernier administrateur/i);
    await expect(changeMemberRole(d, ADMIN, "org-a", "u2", "lecteur")).rejects.toThrow(
      /dernier administrateur/i,
    );
  });

  it("retrait : supprime la membership et révoque les sessions s'il n'en reste aucune", async () => {
    const d = deps({
      memberships: {
        findByOrganizationAndUser: async () => membership(),
        countForUser: async () => 0,
      },
    });
    await removeMember(d, ADMIN, "org-a", "u2");
    expect(d.memberships.remove).toHaveBeenCalledWith("org-a", "u2");
    expect(d.sessions.deleteByUser).toHaveBeenCalledWith("u2");
  });

  it("une cible d'une autre organisation est un 404 (pas un 403)", async () => {
    const d = deps({});
    await expect(removeMember(d, ADMIN, "org-b", "u2")).rejects.toThrow(/introuvable/i);
  });
});
