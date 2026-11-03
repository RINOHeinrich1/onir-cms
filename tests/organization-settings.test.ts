import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type { OrganizationSettingsRepository } from "@/application/ports/organization-settings-repository";
import {
  getExpirationAlertDays,
  updateExpirationAlertDays,
} from "@/application/use-cases/organizations/manage-organization-settings";

const ADMIN: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

function deps() {
  const get = vi.fn(async () => 5);
  const set = vi.fn(async (_organizationId: string, days: number) => days);
  return {
    settings: {
      getExpirationAlertDays: get,
      setExpirationAlertDays: set,
    } as unknown as OrganizationSettingsRepository,
    get,
    set,
  };
}

describe("organisation — seuil d'alerte d'expiration", () => {
  it("lit le seuil global de l'organisation", async () => {
    const base = deps();
    await expect(getExpirationAlertDays(base, "org-1")).resolves.toBe(5);
    expect(base.get).toHaveBeenCalledWith("org-1");
  });

  it("met à jour le seuil dans l'organisation active", async () => {
    const base = deps();
    await expect(updateExpirationAlertDays(base, ADMIN, 7)).resolves.toBe(7);
    expect(base.set).toHaveBeenCalledWith("org-1", 7);
  });

  it("refuse un seuil hors bornes", async () => {
    const base = deps();
    await expect(updateExpirationAlertDays(base, ADMIN, -1)).rejects.toThrow("entre 0 et 365");
    await expect(updateExpirationAlertDays(base, ADMIN, 366)).rejects.toThrow("entre 0 et 365");
    expect(base.set).not.toHaveBeenCalled();
  });
});
