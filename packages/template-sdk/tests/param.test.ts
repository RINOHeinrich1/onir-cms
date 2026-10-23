import { describe, expect, it } from "vitest";
import { hasCapability, param } from "../src/params.js";
import type { OnirtechContext } from "../src/types.js";

function context(partial: Record<string, unknown>): OnirtechContext {
  return partial as unknown as OnirtechContext;
}

describe("param", () => {
  it("retourne la valeur présente", () => {
    const ctx = context({ params: { titre: "Album souvenirs" } });
    expect(param(ctx, "titre", "Défaut")).toBe("Album souvenirs");
  });

  it("retourne le repli quand `params` est absent", () => {
    expect(param(context({}), "titre", "Défaut")).toBe("Défaut");
  });

  it("retourne le repli quand la valeur n'est pas scalaire", () => {
    const ctx = context({ params: { titre: { nested: true } } });
    expect(param(ctx, "titre", "Défaut")).toBe("Défaut");
  });

  it("conserve les nombres et les booléens", () => {
    const ctx = context({ params: { taille: 12, actif: false } });
    expect(param(ctx, "taille", 0)).toBe(12);
    expect(param(ctx, "actif", true)).toBe(false);
  });
});

describe("hasCapability", () => {
  it("vrai quand la capacité est déclarée", () => {
    expect(hasCapability(context({ capabilities: ["messages", "media"] }), "media")).toBe(true);
  });

  it("faux quand la capacité est absente", () => {
    expect(hasCapability(context({ capabilities: ["messages"] }), "media")).toBe(false);
  });

  it("faux quand `capabilities` est absent (harness minimal)", () => {
    expect(hasCapability(context({}), "media")).toBe(false);
  });
});
