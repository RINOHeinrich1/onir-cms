import { describe, expect, it } from "vitest";
import type { Prospect } from "@/domain/entities/prospect";
import { parseProspectOriginFilter, prospectOriginFilterValue } from "@/domain/entities/prospect";
import { prospectContext, validateProspect } from "@/domain/prospect-rules";

describe("validateProspect — RM-PROSPECT-001", () => {
  it("accepte un prospect complet et normalise", () => {
    const result = validateProspect({
      nom: "  Rakoto  ",
      prenom: "Jean",
      nature: "physique",
      email: "JEAN@Exemple.com",
      activite: "Commerce",
      fonction: "Gérant",
      detail: "Vu au salon.",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        nom: "Rakoto",
        prenom: "Jean",
        nature: "physique",
        email: "jean@exemple.com",
        activite: "Commerce",
        fonction: "Gérant",
        detail: "Vu au salon.",
      },
    });
  });

  it("refuse sans nom, email invalide ou nature inconnue", () => {
    const result = validateProspect({ nom: "", email: "pas-un-email", nature: "robot" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field).sort()).toEqual(["email", "nature", "nom"]);
    }
  });

  it("refuse une entrée non-objet", () => {
    expect(validateProspect(null).ok).toBe(false);
    expect(validateProspect("texte").ok).toBe(false);
  });
});

describe("prospectContext", () => {
  it("compose le contexte sans les champs vides", () => {
    const prospect: Prospect = {
      id: "1",
      organizationId: "org-1",
      nom: "Rakoto",
      prenom: "",
      nature: "morale",
      email: "contact@societe.mg",
      activite: "",
      fonction: "Direction",
      detail: "",
      origine: "saisie",
      lienId: null,
      lienLabel: null,
      createdBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    expect(prospectContext(prospect)).toBe(
      "Nom : Rakoto\nNature : personne morale\nEmail : contact@societe.mg\nFonction : Direction",
    );
  });
});

describe("filtre d'origine des prospects", () => {
  it("parse les valeurs manuelles et les libellés de liens", () => {
    expect(parseProspectOriginFilter(undefined)).toBeNull();
    expect(parseProspectOriginFilter("inconnu")).toBeNull();
    expect(parseProspectOriginFilter("manuel")).toEqual({ kind: "manuel" });
    expect(parseProspectOriginFilter("lien:Campagne été")).toEqual({
      kind: "lien",
      label: "Campagne été",
    });
    expect(parseProspectOriginFilter("lien:")).toEqual({ kind: "lien", label: "" });
  });

  it("sérialise le filtre pour l'URL", () => {
    expect(prospectOriginFilterValue(null)).toBeNull();
    expect(prospectOriginFilterValue({ kind: "manuel" })).toBe("manuel");
    expect(prospectOriginFilterValue({ kind: "lien", label: "Campagne été" })).toBe(
      "lien:Campagne été",
    );
  });
});
