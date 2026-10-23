import { describe, expect, it } from "vitest";
import { validateMediaLien, validateMediaMeta } from "@/domain/entities/media";

describe("validateMediaMeta — RM-MEDIA-001", () => {
  it("normalise libellé, portée et actif", () => {
    const result = validateMediaMeta({
      libelle: "  Logo produit  ",
      templateKeys: ["  fiche-projet ", "photo-produit", "fiche-projet"],
      actif: false,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        libelle: "Logo produit",
        description: "",
        templateKeys: ["fiche-projet", "photo-produit"],
        actif: false,
      },
    });
  });

  it("portée vide => globale, actif par défaut", () => {
    const result = validateMediaMeta({ libelle: "Contact" });
    expect(result).toEqual({
      ok: true,
      value: { libelle: "Contact", description: "", templateKeys: [], actif: true },
    });
  });

  it("accepte l'ancien champ mono-valeur et les chaînes vides", () => {
    expect(validateMediaMeta({ libelle: "Contact", templateKey: " fiche-projet " })).toEqual({
      ok: true,
      value: { libelle: "Contact", description: "", templateKeys: ["fiche-projet"], actif: true },
    });
    expect(validateMediaMeta({ libelle: "Contact", templateKey: "" })).toEqual({
      ok: true,
      value: { libelle: "Contact", description: "", templateKeys: [], actif: true },
    });
  });

  it("refuse plus de modèles que la borne", () => {
    const many = Array.from({ length: 21 }, (_, index) => `modele-${index}`);
    expect(validateMediaMeta({ libelle: "Contact", templateKeys: many }).ok).toBe(false);
  });

  it("refuse sans libellé ou trop long", () => {
    expect(validateMediaMeta({}).ok).toBe(false);
    expect(validateMediaMeta({ libelle: "x".repeat(121) }).ok).toBe(false);
  });

  it("accepte une description longue et la borne", () => {
    expect(
      validateMediaMeta({
        libelle: "Contact",
        description: "  Discussion\r\nLigne 2\n\nParagraphe  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        libelle: "Contact",
        description: "Discussion\nLigne 2\n\nParagraphe",
        templateKeys: [],
        actif: true,
      },
    });
    expect(validateMediaMeta({ libelle: "Contact", description: "x".repeat(2001) }).ok).toBe(false);
  });
});

describe("validateMediaLien — RM-MEDIA-001", () => {
  it("accepte une URL http(s)", () => {
    const result = validateMediaLien({ libelle: "Doc", url: "https://onirtech.com/doc" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.url).toBe("https://onirtech.com/doc");
  });

  it("refuse une URL absente, invalide ou non http(s)", () => {
    expect(validateMediaLien({ libelle: "Doc" }).ok).toBe(false);
    expect(validateMediaLien({ libelle: "Doc", url: "pas-une-url" }).ok).toBe(false);
    expect(validateMediaLien({ libelle: "Doc", url: "ftp://exemple.mg" }).ok).toBe(false);
  });

  it("cumule les erreurs (libellé + URL)", () => {
    const result = validateMediaLien({ libelle: "", url: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field).sort()).toEqual(["libelle", "url"]);
    }
  });
});
