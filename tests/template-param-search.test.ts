import { describe, expect, it } from "vitest";
import { searchTemplateParamPaths } from "@/domain/template-param-search";
import { puzzleV2Editor, puzzleV2Params, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

const search = (query: string) =>
  searchTemplateParamPaths(puzzleV2Params, puzzleV2Values, puzzleV2Editor.collections, query);

describe("recherche des paramètres par contenu", () => {
  it("trouve un texte dans une collection imbriquée", () => {
    const paths = search("Formation informatique");
    expect(paths).not.toBeNull();
    expect([...(paths ?? [])].some((path) => path.includes("blocks[2].title"))).toBe(true);
  });

  it("trouve un texte dans un objet simple", () => {
    const paths = search("Accueil");
    expect(paths).not.toBeNull();
    expect([...(paths ?? [])].some((path) => path.startsWith("pages["))).toBe(true);
  });

  it("ne trouve pas un identifiant technique masqué", () => {
    const paths = search("card_two");
    expect(paths?.size ?? 0).toBe(0);
  });

  it("ignore la casse et les accents", () => {
    const paths = search("a propos");
    expect(paths).not.toBeNull();
    expect([...(paths ?? [])].some((path) => path.startsWith("pages["))).toBe(true);
  });
});
