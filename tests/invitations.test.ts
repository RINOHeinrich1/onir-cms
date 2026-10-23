import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type {
  AcceptInvitationResult,
  CreateInvitationInput,
  InvitationRecord,
  InvitationRepository,
} from "@/application/ports/invitation-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { SessionRepository } from "@/application/ports/session-repository";
import { acceptInvitation } from "@/application/use-cases/invitations/accept-invitation";
import { createInvitation } from "@/application/use-cases/invitations/create-invitation";
import { listInvitations } from "@/application/use-cases/invitations/list-invitations";
import { resolveInvitation } from "@/application/use-cases/invitations/resolve-invitation";
import { revokeInvitation } from "@/application/use-cases/invitations/revoke-invitation";
import {
  invitationExpiry,
  invitationStatus,
  isInvitationScopeValid,
} from "@/domain/entities/invitation";
import type { Organization } from "@/domain/entities/organization";

const SUPER: Actor = {
  id: "super-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: true,
};
const ADMIN: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("LINK_TOKEN_KEY", "e".repeat(64));
});

function organization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Onirtech",
    suspendedAt: null,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function orgRepo(overrides: Partial<OrganizationRepository> = {}): OrganizationRepository {
  return {
    create: async () => organization(),
    findById: async (id) => (id === "org-1" ? organization() : null),
    findByName: async () => null,
    listAll: async () => [organization()],
    listForUser: async () => [organization()],
    rename: async () => null,
    setSuspended: async () => null,
    provisionDefaults: async () => undefined,
    ...overrides,
  };
}

function record(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "inv-1",
    organizationId: "org-1",
    organizationName: "Onirtech",
    role: "lecteur",
    invitedBy: "admin-1",
    invitedByEmail: "admin@example.com",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    acceptedAt: null,
    acceptedBy: null,
    acceptedEmail: null,
    acceptedName: null,
    revokedAt: null,
    createdAt: new Date(0).toISOString(),
    token: "jeton-clair",
    ...overrides,
  };
}

function invitationRepo(overrides: Partial<InvitationRepository> = {}): InvitationRepository {
  return {
    create: vi.fn(async (input: CreateInvitationInput) =>
      record({
        organizationId: input.organizationId,
        role: input.role,
        invitedBy: input.invitedBy,
      }),
    ),
    findById: async () => record(),
    findByTokenHash: async () => record(),
    listForOrganization: async () => [record()],
    listAll: async () => [record()],
    revoke: async () => true,
    accept: async (): Promise<AcceptInvitationResult> => ({
      ok: true,
      invitationId: "inv-1",
      userId: "user-1",
      organizationId: "org-1",
      organizationName: "Onirtech",
      role: "lecteur",
      mustChangePassword: false,
    }),
    ...overrides,
  };
}

function sessionRepo(): SessionRepository {
  return {
    create: vi.fn(async (input) => ({
      id: "session-1",
      tokenHash: input.tokenHash,
      userId: input.userId,
      activeOrganizationId: input.activeOrganizationId,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: new Date(0).toISOString(),
    })),
    findByTokenHash: async () => null,
    setActiveOrganization: async () => undefined,
    delete: async () => undefined,
    deleteByUser: async () => undefined,
  };
}

describe("domaine invitation", () => {
  it("calcule le statut dans l'ordre acceptée > révoquée > expirée > en attente", () => {
    expect(invitationStatus(record({ acceptedAt: new Date().toISOString() }))).toBe("accepted");
    expect(invitationStatus(record({ revokedAt: new Date().toISOString() }))).toBe("revoked");
    expect(invitationStatus(record({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).toBe(
      "expired",
    );
    expect(invitationStatus(record())).toBe("pending");
  });

  it("valide la portée : organisation nulle réservée au rôle admin", () => {
    expect(isInvitationScopeValid("org-1", "lecteur")).toBe(true);
    expect(isInvitationScopeValid(null, "admin")).toBe(true);
    expect(isInvitationScopeValid(null, "marketeur")).toBe(false);
    expect(invitationExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});

describe("createInvitation", () => {
  it("admin d'organisation : rôle vide → lecteur, organisation imposée", async () => {
    const repo = invitationRepo();
    const result = await createInvitation({ invitations: repo, organizations: orgRepo() }, ADMIN, {
      organizationId: "org-1",
    });
    expect(result.invitation.role).toBe("lecteur");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", role: "lecteur", invitedBy: "admin-1" }),
    );
    expect(result.token).not.toBe("");
  });

  it("admin d'organisation : organisation étrangère refusée", async () => {
    await expect(
      createInvitation({ invitations: invitationRepo(), organizations: orgRepo() }, ADMIN, {
        organizationId: "org-2",
      }),
    ).rejects.toThrow(/introuvable/i);
  });

  it("admin d'organisation : organisation vide interdite", async () => {
    await expect(
      createInvitation({ invitations: invitationRepo(), organizations: orgRepo() }, ADMIN, {
        role: "admin",
      }),
    ).rejects.toThrow(/super-administrateur/i);
  });

  it("super-admin : aucune organisation + rôle lecteur refusé", async () => {
    await expect(
      createInvitation({ invitations: invitationRepo(), organizations: orgRepo() }, SUPER, {
        role: "lecteur",
      }),
    ).rejects.toThrow(/organisation est obligatoire/i);
  });

  it("super-admin : aucune organisation + rôle admin → organisation personnelle", async () => {
    const repo = invitationRepo();
    const result = await createInvitation({ invitations: repo, organizations: orgRepo() }, SUPER, {
      organizationId: "",
      role: "admin",
    });
    expect(result.invitation.organizationId).toBeNull();
    expect(result.invitation.role).toBe("admin");
  });

  it("rôle inconnu et organisation suspendue refusés", async () => {
    await expect(
      createInvitation({ invitations: invitationRepo(), organizations: orgRepo() }, SUPER, {
        organizationId: "org-1",
        role: "patron",
      }),
    ).rejects.toThrow(/rôle invalide/i);

    await expect(
      createInvitation(
        {
          invitations: invitationRepo(),
          organizations: orgRepo({
            findById: async () => organization({ suspendedAt: new Date().toISOString() }),
          }),
        },
        ADMIN,
        { organizationId: "org-1", role: "lecteur" },
      ),
    ).rejects.toThrow(/suspendue/i);
  });
});

describe("listInvitations et revokeInvitation", () => {
  it("liste : super-admin = toutes ; sinon organisation active", async () => {
    const all = vi.fn(async () => [record(), record({ id: "inv-2" })]);
    const mine = vi.fn(async () => [record()]);
    const repo = invitationRepo({ listAll: all, listForOrganization: mine });
    expect(await listInvitations({ invitations: repo }, SUPER)).toHaveLength(2);
    expect(await listInvitations({ invitations: repo }, ADMIN)).toHaveLength(1);
    expect(mine).toHaveBeenCalledWith("org-1");
  });

  it("révocation : refusée hors organisation pour un admin, ok sinon", async () => {
    await expect(
      revokeInvitation(
        {
          invitations: invitationRepo({
            findById: async () => record({ organizationId: "org-2" }),
          }),
        },
        ADMIN,
        "inv-1",
      ),
    ).rejects.toThrow(/introuvable/i);

    await expect(
      revokeInvitation({ invitations: invitationRepo() }, ADMIN, "inv-1"),
    ).resolves.toMatchObject({ id: "inv-1" });
  });

  it("révocation d'une invitation personnelle réservée au super-admin", async () => {
    const repo = invitationRepo({ findById: async () => record({ organizationId: null }) });
    await expect(revokeInvitation({ invitations: repo }, ADMIN, "inv-1")).rejects.toThrow(
      /super-administrateur/i,
    );
    await expect(revokeInvitation({ invitations: repo }, SUPER, "inv-1")).resolves.toBeTruthy();
  });

  it("révocation impossible si déjà acceptée ou révoquée", async () => {
    await expect(
      revokeInvitation(
        { invitations: invitationRepo({ revoke: async () => false }) },
        ADMIN,
        "inv-1",
      ),
    ).rejects.toThrow(/déjà acceptée ou révoquée/i);
  });
});

describe("resolveInvitation", () => {
  it("retourne le statut, l'organisation et le rôle public", async () => {
    const resolved = await resolveInvitation({ invitations: invitationRepo() }, "jeton-clair");
    expect(resolved).toMatchObject({
      status: "pending",
      organizationId: "org-1",
      organizationName: "Onirtech",
      role: "lecteur",
    });
    expect(await resolveInvitation({ invitations: invitationRepo() }, "  ")).toBeNull();
  });

  it("invitation personnelle → rôle affiché admin", async () => {
    const resolved = await resolveInvitation(
      {
        invitations: invitationRepo({
          findByTokenHash: async () => record({ organizationId: null }),
        }),
      },
      "jeton-clair",
    );
    expect(resolved?.role).toBe("admin");
  });
});

describe("acceptInvitation", () => {
  it("valide les entrées avant persistance", async () => {
    const deps = { invitations: invitationRepo(), sessions: sessionRepo() };
    await expect(
      acceptInvitation(deps, { token: "x", name: "A", email: "a@b.fr", password: "motdepasse123" }),
    ).rejects.toThrow(/nom requis/i);
    await expect(
      acceptInvitation(deps, {
        token: "x",
        name: "Alice",
        email: "nope",
        password: "motdepasse123",
      }),
    ).rejects.toThrow(/email invalide/i);
    await expect(
      acceptInvitation(deps, { token: "x", name: "Alice", email: "a@b.fr", password: "court" }),
    ).rejects.toThrow(/mot de passe trop court/i);
  });

  it("traduit les échecs d'acceptation en erreurs HTTP typées", async () => {
    const failure = (reason: string) =>
      invitationRepo({
        accept: async (): Promise<AcceptInvitationResult> => ({
          ok: false,
          reason: reason as never,
        }),
      });
    const deps = (reason: string) => ({ invitations: failure(reason), sessions: sessionRepo() });

    await expect(
      acceptInvitation(deps("invalid"), {
        token: "jeton",
        name: "Alice",
        email: "a@b.fr",
        password: "motdepasse123",
      }),
    ).rejects.toThrow(/invalide ou expirée/i);
    await expect(
      acceptInvitation(deps("invalid_credentials"), {
        token: "jeton",
        name: "Alice",
        email: "a@b.fr",
        password: "motdepasse123",
      }),
    ).rejects.toThrow(/email ou mot de passe incorrect/i);
    await expect(
      acceptInvitation(deps("already_member"), {
        token: "jeton",
        name: "Alice",
        email: "a@b.fr",
        password: "motdepasse123",
      }),
    ).rejects.toThrow(/déjà membre/i);
    await expect(
      acceptInvitation(deps("organization_suspended"), {
        token: "jeton",
        name: "Alice",
        email: "a@b.fr",
        password: "motdepasse123",
      }),
    ).rejects.toThrow(/suspendue/i);
  });

  it("succès : crée la session sur l'organisation effective", async () => {
    const sessions = sessionRepo();
    const result = await acceptInvitation(
      { invitations: invitationRepo(), sessions },
      { token: "jeton", name: "Alice", email: "a@b.fr", password: "motdepasse123" },
    );
    expect(result).toMatchObject({
      organizationId: "org-1",
      role: "lecteur",
      mustChangePassword: false,
    });
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ activeOrganizationId: "org-1", userId: "user-1" }),
    );
  });
});
