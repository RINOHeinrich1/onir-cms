import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type { LimitProfile, LimitProfileRepository } from "@/application/ports/limit-profile-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import { assignLimitProfile } from "@/application/use-cases/organizations/assign-limit-profile";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";

const zeroProvisioning: OrganizationProvisioning = {
  maxChatbots: 0,
  maxTokens: 0,
  maxMessages: 0,
  messageLimitPolicy: "block",
  maxStorageMb: 0,
  tokenResetMode: "manual",
  tokenResetDays: null,
  allocations: [],
  defaults: [],
};

const profile: LimitProfile = {
  id: "zero-profile",
  name: "Suspension",
  description: "",
  provisioning: zeroProvisioning,
  active: true,
  createdAt: "2026-11-13T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
};

const superAdmin: Actor = {
  id: "admin-id",
  role: "admin",
  organizationId: null,
  isSuperAdmin: true,
};

describe("assignation du profil de suspension", () => {
  it("assigne un profil zéro actif à une organisation", async () => {
    const applyToOrganization = vi.fn().mockResolvedValue(profile);
    const deps = {
      profiles: {
        findById: vi.fn().mockResolvedValue(profile),
        applyToOrganization,
      } as unknown as LimitProfileRepository,
      organizations: {
        findById: vi.fn().mockResolvedValue({ id: "org-id" }),
      } as unknown as OrganizationRepository,
    };

    await expect(
      assignLimitProfile(deps, superAdmin, "org-id", { profileId: "zero-profile" }),
    ).resolves.toEqual({ profileId: "zero-profile" });
    expect(applyToOrganization).toHaveBeenCalledWith("org-id", "zero-profile", "admin-id");
  });

  it("refuse un acteur non super-admin", async () => {
    const deps = {
      profiles: {} as LimitProfileRepository,
      organizations: {} as OrganizationRepository,
    };
    await expect(
      assignLimitProfile(
        deps,
        { ...superAdmin, isSuperAdmin: false },
        "org-id",
        { profileId: "zero-profile" },
      ),
    ).rejects.toThrow();
  });
});
