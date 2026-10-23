import { describe, expect, it } from "vitest";
import type { Actor } from "@/application/actor";
import { actorCan, assertCan, assertSuperAdmin, organizationOf } from "@/application/actor";
import { ForbiddenError, NoOrganizationError } from "@/application/errors";

const base: Actor = {
  id: "u1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

describe("actorCan — rôle effectif et override super-admin (ADR-0025)", () => {
  it("super-admin : autorisé partout, même sans organisation", () => {
    const actor: Actor = { ...base, role: null, organizationId: null, isSuperAdmin: true };
    expect(actorCan(actor, "users:list")).toBe(true);
    expect(actorCan(actor, "organizations:create")).toBe(true);
  });

  it("sans organisation : aucune permission métier", () => {
    const actor: Actor = { ...base, role: null, organizationId: null };
    expect(actorCan(actor, "prospects:list")).toBe(false);
    expect(actorCan(actor, "dashboard:view")).toBe(false);
  });

  it("le rôle vient de la membership active (lecteur en lecture seule)", () => {
    const lecteur: Actor = { ...base, role: "lecteur" };
    expect(actorCan(lecteur, "prospects:list")).toBe(true);
    expect(actorCan(lecteur, "prospects:create")).toBe(false);
  });

  it("organisation suspendue : aucune donnée métier, administration visible", () => {
    const actor: Actor = { ...base, organizationSuspended: true };
    expect(actorCan(actor, "prospects:list")).toBe(false);
    expect(actorCan(actor, "organizations:list")).toBe(true);
    expect(actorCan(actor, "organizations:read")).toBe(true);
  });

  it("organizationOf refuse une absence d'organisation", () => {
    expect(() => organizationOf({ ...base, organizationId: null })).toThrow(NoOrganizationError);
    expect(organizationOf(base)).toBe("org-1");
  });

  it("assertCan / assertSuperAdmin lèvent des 403 explicites", () => {
    const lecteur: Actor = { ...base, role: "lecteur" };
    expect(() => assertCan(lecteur, "users:create")).toThrow(ForbiddenError);
    expect(() => assertSuperAdmin(lecteur)).toThrow(ForbiddenError);
    expect(() => assertSuperAdmin({ ...base, isSuperAdmin: true })).not.toThrow();
  });
});
