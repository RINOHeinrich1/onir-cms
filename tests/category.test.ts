import { describe, expect, it } from "vitest";
import { categorySlug, isCategorySlug } from "@/domain/entities/category";

describe("catégories — slug et clés", () => {
  it("génère un slug stable sans accents", () => {
    expect(categorySlug("Étiquettes & Promotions")).toBe("etiquettes-promotions");
    expect(categorySlug("  Produits  ")).toBe("produits");
    expect(categorySlug("???")).toBe("categorie");
  });

  it("valide le format du slug", () => {
    expect(isCategorySlug("produits")).toBe(true);
    expect(isCategorySlug("produits-2026")).toBe(true);
    expect(isCategorySlug("Produits")).toBe(false);
    expect(isCategorySlug("produits_2026")).toBe(false);
  });
});
