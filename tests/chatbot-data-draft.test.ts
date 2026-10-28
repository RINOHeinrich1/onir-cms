import { describe, expect, it } from "vitest";
import {
  chatbotDataDraftCount,
  validateConnaissanceDraft,
  validateLienDraft,
  validatePhotoDraft,
} from "@/components/links/chatbot-data-draft";

describe("brouillons de données du wizard", () => {
  it("compte les ajouts toutes natures confondues", () => {
    expect(
      chatbotDataDraftCount({
        connaissances: [{ id: "c1", titre: "A", contenu: "B" }],
        liens: [{ id: "l1", libelle: "Doc", url: "https://onirtech.com", description: "" }],
        photos: [
          {
            id: "p1",
            fichier: new File(["x"], "photo.png", { type: "image/png" }),
            libelle: "Photo",
            description: "",
          },
        ],
      }),
    ).toBe(3);
    expect(chatbotDataDraftCount({ connaissances: [], liens: [], photos: [] })).toBe(0);
  });

  it("valide une connaissance (titre + contenu obligatoires)", () => {
    expect(validateConnaissanceDraft({ titre: "Tarifs", contenu: "Sur devis" })).toBeNull();
    expect(validateConnaissanceDraft({ titre: "  ", contenu: "x" })).toMatch(/titre/i);
    expect(validateConnaissanceDraft({ titre: "x", contenu: " " })).toMatch(/contenu/i);
  });

  it("valide un lien (libellé + URL http(s))", () => {
    expect(
      validateLienDraft({ libelle: "Doc", url: "https://onirtech.com/doc", description: "" }),
    ).toBeNull();
    expect(validateLienDraft({ libelle: "", url: "https://x.mg", description: "" })).toMatch(
      /libellé/i,
    );
    expect(validateLienDraft({ libelle: "Doc", url: "", description: "" })).toMatch(/URL/i);
    expect(validateLienDraft({ libelle: "Doc", url: "ftp://x.mg", description: "" })).toMatch(
      /http/i,
    );
    expect(validateLienDraft({ libelle: "Doc", url: "pas-une-url", description: "" })).toMatch(
      /invalide/i,
    );
  });

  it("valide une photo (fichier + libellé)", () => {
    const fichier = new File(["x"], "photo.png", { type: "image/png" });
    expect(validatePhotoDraft({ fichier, libelle: "Photo", description: "" })).toBeNull();
    expect(
      validatePhotoDraft({
        fichier: null as unknown as File,
        libelle: "Photo",
        description: "",
      }),
    ).toMatch(/fichier/i);
    expect(validatePhotoDraft({ fichier, libelle: " ", description: "" })).toMatch(/libellé/i);
  });
});
