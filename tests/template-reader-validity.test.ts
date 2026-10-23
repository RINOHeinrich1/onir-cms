import { describe, expect, it } from "vitest";
import { parseValidityDays } from "@/application/use-cases/visual-templates/manage-template-reader";

describe("validité du compte lecteur", () => {
  it("accepte 0 (illimitée) et les durées positives", () => {
    expect(parseValidityDays(undefined, 0)).toBe(0);
    expect(parseValidityDays("90", 0)).toBe(90);
    expect(parseValidityDays(3650, 0)).toBe(3650);
  });

  it("refuse les durées invalides", () => {
    expect(() => parseValidityDays(-1, 0)).toThrow();
    expect(() => parseValidityDays(3651, 0)).toThrow();
    expect(() => parseValidityDays(1.5, 0)).toThrow();
    expect(() => parseValidityDays("abc", 0)).toThrow();
  });
});
