import { describe, expect, it } from "vitest";
import { ACTIONS, type Action, actionsFor, can } from "@/domain/rbac";

describe("RBAC — matrice des rôles (RM-ROLE-*)", () => {
  it("admin dispose de toutes les actions", () => {
    for (const action of ACTIONS) {
      expect(can("admin", action)).toBe(true);
    }
  });

  it("marketeur ne peut pas administrer les utilisateurs mais peut gérer les prospects", () => {
    expect(can("marketeur", "users:list")).toBe(false);
    expect(can("marketeur", "users:create")).toBe(false);
    expect(can("marketeur", "users:update")).toBe(false);
    expect(can("marketeur", "users:delete")).toBe(false);
    expect(can("marketeur", "prospects:list")).toBe(true);
    expect(can("marketeur", "prospects:create")).toBe(true);
    expect(can("marketeur", "chat:use")).toBe(true);
  });

  it("opérateur chat : conversations uniquement, aucun droit sur les liens", () => {
    for (const action of [
      "conversations:list",
      "conversations:read",
      "conversations:intervene",
      "conversations:generate_fiche",
    ] as const) {
      expect(can("operateur", action)).toBe(true);
    }
    for (const action of [
      "dashboard:view",
      "links:list",
      "links:create",
      "links:update",
      "links:revoke",
      "project:read",
      "project:write",
      "users:list",
      "members:list",
      "organizations:list",
    ] as const) {
      expect(can("operateur", action)).toBe(false);
    }
  });

  it("admin et marketeur interviennent ; lecteur reste en lecture seule", () => {
    expect(can("admin", "conversations:intervene")).toBe(true);
    expect(can("marketeur", "conversations:intervene")).toBe(true);
    expect(can("lecteur", "conversations:intervene")).toBe(false);
    expect(can("admin", "conversations:generate_fiche")).toBe(true);
    expect(can("marketeur", "conversations:generate_fiche")).toBe(true);
    expect(can("lecteur", "conversations:generate_fiche")).toBe(false);
  });

  it("lecteur est en lecture seule", () => {
    expect(can("lecteur", "dashboard:view")).toBe(true);
    expect(can("lecteur", "prospects:list")).toBe(true);
    expect(can("lecteur", "prospects:create")).toBe(false);
    expect(can("lecteur", "chat:use")).toBe(false);
    expect(can("lecteur", "users:list")).toBe(false);
  });

  it("marketeur gère les modèles, lecteur lit seulement (templates:*)", () => {
    for (const action of [
      "templates:list",
      "templates:read",
      "templates:create",
      "templates:update",
      "templates:delete",
    ] as const) {
      expect(can("marketeur", action)).toBe(true);
    }
    expect(can("lecteur", "templates:list")).toBe(true);
    expect(can("lecteur", "templates:read")).toBe(true);
    expect(can("lecteur", "templates:create")).toBe(false);
    expect(can("lecteur", "templates:update")).toBe(false);
    expect(can("lecteur", "templates:delete")).toBe(false);
  });

  it("marketeur gère la base de connaissances, lecteur lit seulement (connaissances:*)", () => {
    for (const action of [
      "connaissances:list",
      "connaissances:read",
      "connaissances:create",
      "connaissances:update",
      "connaissances:delete",
    ] as const) {
      expect(can("marketeur", action)).toBe(true);
    }
    expect(can("lecteur", "connaissances:list")).toBe(true);
    expect(can("lecteur", "connaissances:read")).toBe(true);
    expect(can("lecteur", "connaissances:create")).toBe(false);
    expect(can("lecteur", "connaissances:update")).toBe(false);
    expect(can("lecteur", "connaissances:delete")).toBe(false);
  });

  it("marketeur gère la médiathèque, lecteur lit seulement (medias:*)", () => {
    for (const action of [
      "medias:list",
      "medias:read",
      "medias:create",
      "medias:update",
      "medias:delete",
    ] as const) {
      expect(can("marketeur", action)).toBe(true);
    }
    expect(can("lecteur", "medias:list")).toBe(true);
    expect(can("lecteur", "medias:read")).toBe(true);
    expect(can("lecteur", "medias:create")).toBe(false);
    expect(can("lecteur", "medias:update")).toBe(false);
    expect(can("lecteur", "medias:delete")).toBe(false);
  });

  it("conversations : lecture pour tous, écriture pour admin/marketeur (conversations:*)", () => {
    for (const role of ["admin", "marketeur", "lecteur", "operateur"] as const) {
      expect(can(role, "conversations:list")).toBe(true);
      expect(can(role, "conversations:read")).toBe(true);
    }
    expect(can("admin", "conversations:update")).toBe(true);
    expect(can("marketeur", "conversations:update")).toBe(true);
    expect(can("lecteur", "conversations:update")).toBe(false);
  });

  it("confidentialité : CRUD pour admin/marketeur, lecture pour lecteur (confidentialites:*)", () => {
    for (const action of [
      "confidentialites:list",
      "confidentialites:read",
      "confidentialites:create",
      "confidentialites:update",
      "confidentialites:delete",
    ] as const) {
      expect(can("marketeur", action)).toBe(true);
    }
    expect(can("lecteur", "confidentialites:list")).toBe(true);
    expect(can("lecteur", "confidentialites:read")).toBe(true);
    expect(can("lecteur", "confidentialites:create")).toBe(false);
    expect(can("lecteur", "confidentialites:update")).toBe(false);
    expect(can("lecteur", "confidentialites:delete")).toBe(false);
  });

  it("fournisseurs IA : admin gère, marketeur consulte et affecte, lecteur aucun accès", () => {
    for (const action of ["ai:list", "ai:read", "ai:manage", "ai:assign"] as const) {
      expect(can("admin", action)).toBe(true);
    }
    expect(can("marketeur", "ai:list")).toBe(true);
    expect(can("marketeur", "ai:read")).toBe(true);
    expect(can("marketeur", "ai:assign")).toBe(true);
    expect(can("marketeur", "ai:manage")).toBe(false);
    for (const action of ["ai:list", "ai:read", "ai:manage", "ai:assign"] as const) {
      expect(can("lecteur", action)).toBe(false);
    }
  });

  it("administration des organisations : admin uniquement (ADR-0025)", () => {
    for (const action of [
      "organizations:list",
      "organizations:read",
      "organizations:create",
      "organizations:update",
      "members:list",
      "members:create",
      "members:update",
      "members:delete",
    ] as const) {
      expect(can("admin", action)).toBe(true);
      expect(can("marketeur", action)).toBe(false);
      expect(can("lecteur", action)).toBe(false);
    }
  });

  it("refuse une action inconnue pour tous les rôles", () => {
    const unknown = "inexistant:action" as Action;
    expect(can("admin", unknown)).toBe(false);
    expect(can("marketeur", unknown)).toBe(false);
    expect(can("lecteur", unknown)).toBe(false);
  });

  it("actionsFor renvoie un sous-ensemble cohérent", () => {
    expect(actionsFor("admin")).toHaveLength(ACTIONS.length);
    expect(actionsFor("lecteur").length).toBeLessThan(actionsFor("admin").length);
  });
});
