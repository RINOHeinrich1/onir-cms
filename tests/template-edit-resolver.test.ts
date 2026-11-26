import { describe, expect, it } from "vitest";
import { resolveTemplateEditTarget } from "@/domain/template-edit-resolver";
import {
  templateEditEditor as editor,
  templateEditValues as values,
} from "./fixtures/template-edit-fixture";

function resolve(request: string, currentPageId: string | null = "home") {
  return resolveTemplateEditTarget({ request, currentPageId, editor, values });
}

describe("résolution lexicale de cible d'édition", () => {
  it("résout un bouton imbriqué dans une page", () => {
    const result = resolve(
      "change le fond du bouton Parler à notre assistant dans la page d’accueil",
    );
    expect(result.page).toEqual({ pageId: "home", label: "Accueil", source: "explicit" });
    expect(result.candidates[0]?.itemId).toBe("hero_button");
    expect(result.candidates[0]?.pageId).toBe("home");
  });

  it("résout une section dans la page courante", () => {
    const result = resolve("supprime la section À propos de Puzzle", "about");
    expect(result.page?.pageId).toBe("about");
    expect(result.page?.source).toBe("current");
    expect(result.candidates[0]?.itemId).toBe("about_text");
    expect(result.candidates[0]?.itemKind).toBe("text");
  });

  it("résout une page explicitement demandée", () => {
    const result = resolve("supprime la page À propos", "home");
    expect(result.page).toEqual({ pageId: "about", label: "À propos", source: "explicit" });
    expect(result.candidates[0]?.kind).toBe("page");
    expect(result.candidates[0]?.itemId).toBe("about");
  });

  it("marque un bouton d’en-tête partagé comme shared", () => {
    const result = resolve("change le fond du bouton Thème");
    const theme = result.candidates.find((candidate) => candidate.itemId === "theme_btn");
    expect(theme?.scope).toEqual({
      kind: "shared",
      reason: "header",
      pageIds: ["home", "about"],
    });
  });

  it("exclut un bloc rattaché à une autre page", () => {
    const result = resolve("supprime la section À propos de Puzzle", "home");
    expect(result.candidates.some((candidate) => candidate.itemId === "about_text")).toBe(false);
  });

  it("utilise la sélection comme signal prioritaire", () => {
    const result = resolveTemplateEditTarget({
      request: "change le fond",
      currentPageId: "home",
      editor,
      values,
      selection: { regionId: "block:hero_button" },
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.itemId).toBe("hero_button");
    expect(result.candidates[0]?.score).toBe(1);
    expect(result.candidates[0]?.reasons).toContain("sélection");
  });

  it("ne rend pas la sélection exclusive face à une cible nommée", () => {
    const result = resolveTemplateEditTarget({
      request: "modifie le bouton Thème",
      currentPageId: "home",
      editor,
      values,
      selection: { regionId: "block:hero_button" },
    });
    expect(result.candidates.some((candidate) => candidate.itemId === "hero_button")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.itemId === "theme_btn")).toBe(true);
  });

  it("ne devine pas une cible sans correspondance lexicale", () => {
    const result = resolve("supprime la section nous connaître", "about");
    expect(result.page?.pageId).toBe("about");
    expect(result.candidates).toEqual([]);
  });

  it("ne cible pas un kind déclaré absent", () => {
    const result = resolve("ajoute un bloc avec une image au centre");
    expect(result.candidates).toEqual([]);
  });
});
