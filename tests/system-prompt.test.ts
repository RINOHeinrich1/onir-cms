import { describe, expect, it } from "vitest";
import { buildSystemPromptFromTemplate } from "@/infrastructure/ai/system-prompt";

describe("buildSystemPromptFromTemplate", () => {
  it("retire l’instruction historique qui conservait les clés techniques", () => {
    const prompt = buildSystemPromptFromTemplate({
      definition: {
        key: "demo",
        label: "Démo",
        description: "",
        systemPrompt:
          "Traduis les libellés des informations à collecter dans la langue du visiteur dans tes questions, mais conserve les clés techniques pour la fiche interne.",
        fields: [],
        renderTemplate: "# x",
      },
      serverVars: {},
    });
    expect(prompt).not.toContain("conserve les clés techniques");
    expect(prompt).toContain("Ne mentionne jamais les noms techniques");
  });

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
    expect(prompt).toContain("- Budget — obligatoire — text");
    expect(prompt).not.toContain("[budget]");
    expect(prompt).toContain("Ne dis jamais que tout est complet");
    expect(prompt).not.toContain("conserve les clés techniques");
  });
});
