import { describe, expect, it } from "vitest";
import { buildSystemPromptFromTemplate } from "@/infrastructure/ai/system-prompt";

describe("buildSystemPromptFromTemplate", () => {
  it("injecte la liste des champs et les variables serveur", () => {
    const prompt = buildSystemPromptFromTemplate({
      definition: {
        key: "demo",
        label: "Démo",
        description: "",
        systemPrompt: "Contexte : {{prospect_nom}}\n{{champs_guide}}",
        fields: [{ name: "budget", label: "Budget", type: "text", required: true }],
        renderTemplate: "# x",
      },
      serverVars: { prospect_nom: "Rakoto" },
    });
    expect(prompt).toContain("Rakoto");
    expect(prompt).toContain("- Budget (obligatoire)");
  });
});
