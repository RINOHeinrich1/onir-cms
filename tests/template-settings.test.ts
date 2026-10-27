import { describe, expect, it } from "vitest";
import {
  languageInstruction,
  languageReminder,
  normalizeLanguagePolicy,
  normalizeTemplateSimpleSettings,
} from "@/domain/template-settings";

describe("template-settings (mode Simple)", () => {
  it("normalise une politique de langue fixe ou automatique", () => {
    expect(normalizeLanguagePolicy({ mode: "fixed", value: " malgache " })).toEqual({
      mode: "fixed",
      value: "malgache",
    });
    expect(normalizeLanguagePolicy({ mode: "fixed", value: "" })).toEqual({ mode: "auto" });
    expect(normalizeLanguagePolicy({ mode: "inconnu" })).toEqual({ mode: "auto" });
  });

  it("conserve les garde-fous personnalisés et déduplique", () => {
    const settings = normalizeTemplateSimpleSettings({
      role: "assistant",
      objective: "",
      language: { mode: "auto" },
      tone: "direct",
      guardrails: ["professional", "Ne pas parler de concurrence.", "professional"],
      extraInstructions: "Propose un rendez-vous.",
    });
    expect(settings?.guardrails).toEqual(["professional", "Ne pas parler de concurrence."]);
    expect(settings?.extraInstructions).toBe("Propose un rendez-vous.");
  });

  it("ne force aucune langue dans la consigne automatique", () => {
    const text = languageInstruction({ mode: "auto" });
    expect(text).toContain("langue du visiteur");
    expect(text).not.toContain("français");
  });

  it("rappelle la langue après les enrichissements runtime", () => {
    expect(languageReminder({ mode: "auto" })).toContain("langue du visiteur");
    expect(languageReminder({ mode: "fixed", value: "malgache" })).toContain("malgache");
  });
});
