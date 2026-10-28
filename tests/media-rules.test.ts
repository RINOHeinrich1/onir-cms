import { describe, expect, it } from "vitest";
import { validateMediaLien, validateMediaMeta } from "@/domain/entities/media";

describe("validateMediaMeta — RM-MEDIA-001", () => {
  it("normalise libellé, portée et actif", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    const result = validateMediaMeta({
      libelle: "  Logo produit  ",
      chatLinkIds: [` ${first} `, second, first],
      actif: false,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        libelle: "Logo produit",
        description: "",
        chatLinkIds: [first, second],
        actif: false,
      },
    });
  });

  it("portée vide => globale, actif par défaut", () => {
    const result = validateMediaMeta({ libelle: "Contact" });
    expect(result).toEqual({
      ok: true,
      value: { libelle: "Contact", description: "", chatLinkIds: [], actif: true },
    });
  });

  it("accepte un scope global, un chatbot ou plusieurs chatbots", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    expect(validateMediaMeta({ libelle: "Contact", chatLinkIds: [first] })).toEqual({
      ok: true,
      value: { libelle: "Contact", description: "", chatLinkIds: [first], actif: true },
    });
    expect(validateMediaMeta({ libelle: "Contact", chatLinkIds: [first, second] })).toEqual({
      ok: true,
      value: { libelle: "Contact", description: "", chatLinkIds: [first, second], actif: true },
    });
  });

  it("refuse un identifiant de chatbot invalide", () => {
    expect(validateMediaMeta({ libelle: "Contact", chatLinkIds: ["modele-a"] }).ok).toBe(false);
  });

  it("refuse plus de chatbots que la borne", () => {
    const many = Array.from(
      { length: 51 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(validateMediaMeta({ libelle: "Contact", chatLinkIds: many }).ok).toBe(false);
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
        chatLinkIds: [],
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
