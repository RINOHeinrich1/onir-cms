import { describe, expect, it } from "vitest";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import {
  buildDefaultRenderTemplate,
  buildDefaultSystemPrompt,
  toFieldName,
  toTemplateKey,
  uniqueFieldName,
  uniqueTemplateKey,
} from "@/domain/template-defaults";
import { buildSampleData, buildTemplatePreview } from "@/domain/template-preview";

const FIELDS: TemplateField[] = [
  { name: "budget", label: "Budget", type: "text", required: true, example: "5 000 €" },
  {
    name: "lien",
    label: "Lien du projet",
    type: "url",
    required: false,
  },
];

describe("template-defaults", () => {
  it("slugifie les clés et les noms techniques", () => {
    expect(toTemplateKey("Qualification artisan")).toBe("qualification-artisan");
    expect(toTemplateKey("Déjà vu")).toBe("deja-vu");
    expect(toTemplateKey("2026")).toBe("modele-2026");
    expect(toTemplateKey("")).toBe("modele");
    expect(toFieldName("Budget total")).toBe("budget_total");
    expect(toFieldName("5 000 €")).toBe("champ_5_000");
  });

  it("rend les clés et noms uniques", () => {
    expect(uniqueTemplateKey("fiche", ["fiche", "fiche-2"])).toBe("fiche-3");
    expect(uniqueFieldName("budget", ["budget", "budget_2"])).toBe("budget_3");
  });

  it("génère un prompt avec la liste des champs", () => {
    const prompt = buildDefaultSystemPrompt({
      role: "l'assistant de prospection",
      objective: "Qualifier le besoin.",
      tone: "professionnel et chaleureux",
      guardrails: ["professional", "no_promise", "one_question", "known_contacts", "finish"],
      fields: FIELDS,
    });
    expect(prompt).toContain("Qualifier le besoin.");
    expect(prompt).toContain("{{champs_guide}}");
    expect(prompt).toContain("Terminer");
    expect(prompt).toContain("{{#if prospect_connu}}");
  });

  it("génère une fiche qui suit l'ordre des champs", () => {
    const markdown = buildDefaultRenderTemplate("Démo", FIELDS);
    expect(markdown).toContain("# Démo");
    expect(markdown).toContain("Date : {{date}}");
    expect(markdown).toContain("## Budget\n\n{{budget}}");
    expect(markdown).toContain("{{#if lien}}## Lien du projet\n\n{{lien}}{{/if}}");
    expect(markdown.indexOf("## Budget")).toBeLessThan(markdown.indexOf("## Lien du projet"));
  });

  it("construit un aperçu avec les exemples de champs", () => {
    const definition: TemplateDefinition = {
      key: "demo",
      label: "Démo",
      description: "",
      systemPrompt: "Informations :\n{{champs_guide}}",
      fields: FIELDS,
      renderTemplate: "# {{date}}\n\n{{#if budget}}## Budget\n\n{{budget}}{{/if}}",
    };
    const preview = buildTemplatePreview({
      definition,
      sampleData: buildSampleData(definition.fields),
    });
    expect(preview.systemPrompt).toContain("- Budget");
    expect(preview.systemPrompt).toContain("5 000 €");
    expect(preview.markdown).toContain("# 2026-01-01");
    expect(preview.markdown).toContain("5 000 €");
  });
});
