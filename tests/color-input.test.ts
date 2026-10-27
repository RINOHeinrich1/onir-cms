import { describe, expect, it } from "vitest";
import { isCompleteColorInput, normalizeColorInput } from "@/components/links/color-input";

describe("normalizeColorInput", () => {
  it("accepte les hexadécimaux avec ou sans #", () => {
    expect(normalizeColorInput("#023777")).toBe("#023777");
    expect(normalizeColorInput("023777")).toBe("#023777");
    expect(normalizeColorInput("#FCAD28")).toBe("#fcad28");
  });

  it("développe les hexadécimaux courts", () => {
    expect(normalizeColorInput("#fff")).toBe("#ffffff");
    expect(normalizeColorInput("f0a")).toBe("#ff00aa");
  });

  it("convertit rgb(r, g, b) et rgb(r g b)", () => {
    expect(normalizeColorInput("rgb(252, 173, 40)")).toBe("#fcad28");
    expect(normalizeColorInput("rgb(252 173 40)")).toBe("#fcad28");
  });

  it("refuse les saisies invalides", () => {
    expect(normalizeColorInput("")).toBeNull();
    expect(normalizeColorInput("#12345")).toBeNull();
    expect(normalizeColorInput("rgb(256, 0, 0)")).toBeNull();
    expect(normalizeColorInput("bleu")).toBeNull();
  });
});

describe("isCompleteColorInput", () => {
  it("ne considère pas un hex court comme complet", () => {
    expect(isCompleteColorInput("#fff")).toBe(false);
  });

  it("considère un hex 6 chiffres ou un rgb comme complet", () => {
    expect(isCompleteColorInput("#023777")).toBe(true);
    expect(isCompleteColorInput("023777")).toBe(true);
    expect(isCompleteColorInput("rgb(2, 55, 119)")).toBe(true);
  });
});
