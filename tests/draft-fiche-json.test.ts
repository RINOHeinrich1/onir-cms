import { describe, expect, it } from "vitest";
import { parseExtractionJson } from "@/application/use-cases/fiche/draft-fiche";

describe("parseExtractionJson", () => {
  it("accepte un JSON strict", () => {
    expect(parseExtractionJson('{"nom":"Jean"}')).toEqual({ nom: "Jean" });
  });

  it("extrait un JSON entouré d'un bloc Markdown", () => {
    expect(parseExtractionJson('Voici :\n```json\n{"nom":"Jean"}\n```')).toEqual({
      nom: "Jean",
    });
  });

  it("extrait le premier objet d'un texte", () => {
    expect(parseExtractionJson('Résultat: {"nom":"Jean"} — fin')).toEqual({ nom: "Jean" });
  });

  it("retourne null sans JSON exploitable", () => {
    expect(parseExtractionJson("pas de json")).toBeNull();
  });
});
