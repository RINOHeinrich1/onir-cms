import { describe, expect, it } from "vitest";
import { validateConfidentialite } from "@/domain/entities/confidentialite";

describe("validateConfidentialite — US-CONFID-001", () => {
  it("normalise titre, texte, lien et actif", () => {
    const result = validateConfidentialite({
      titre: "  Politique  ",
      texte: "  J'accepte… ",
      lien: " /confidentialite ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        titre: "Politique",
        texte: "J'accepte…",
        lien: "/confidentialite",
        actif: true,
      },
    });
  });

  it("lien optionnel (vide autorisé)", () => {
    const result = validateConfidentialite({ titre: "T", texte: "X", lien: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.lien).toBe("");
  });

  it("refuse sans titre ou sans texte", () => {
    expect(validateConfidentialite({ texte: "X" }).ok).toBe(false);
    expect(validateConfidentialite({ titre: "T" }).ok).toBe(false);
    expect(validateConfidentialite({ titre: "x".repeat(121), texte: "X" }).ok).toBe(false);
  });
});
