import { describe, expect, it } from "vitest";
import { buildTemplateAiPrompt } from "@/application/use-cases/templates/template-ai-prompt";

describe("template-ai-prompt", () => {
  it("ne force pas le français et accepte les champs vides", () => {
    const prompt = buildTemplateAiPrompt({
      description: "Un chatbot qui s'adapte à la langue du client.",
      website: "",
      documents: [],
      existing: null,
    });
    expect(prompt.system).toContain('language.mode = "auto"');
    expect(prompt.system).toContain("Ne force jamais le français");
    expect(prompt.system).toContain("fields = []");
    expect(prompt.system).not.toContain("Les textes doivent être en français");
  });
});
