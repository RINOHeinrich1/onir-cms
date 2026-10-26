import { describe, expect, it } from "vitest";
import { extractAiJsonObject, parseTemplateAiDraft } from "@/domain/template-ai-draft";

const RAW = {
  label: "Rénovation salle de bain",
  description: "Qualifier les demandes de rénovation.",
  role: "l'assistant de qualification",
  objective: "Comprendre le projet et le budget.",
  tone: "direct et concis",
  guardrails: ["professional", "no_promise", "inconnu"],
  fields: [
    {
      label: "Type de projet",
      type: "select",
      required: true,
      options: ["Salle de bain", "Cuisine"],
    },
    { label: "Surface", type: "text", required: false, example: "8 m²" },
  ],
  knowledge: [
    { titre: "Zone d'intervention", contenu: "Lyon et métropole." },
    { titre: "Zone d'intervention", contenu: "Doublon ignoré." },
  ],
};

describe("template-ai-draft (ADR-0038)", () => {
  it("extrait un objet JSON même entouré de markdown", () => {
    expect(extractAiJsonObject('```json\n{"label":"Test"}\n```')).toEqual({ label: "Test" });
    expect(extractAiJsonObject("pas de json")).toBeNull();
  });

  it("normalise les champs, le ton et les connaissances", () => {
    const result = parseTemplateAiDraft(RAW, { key: "renovation-sdb" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields[0]?.name).toBe("type_de_projet");
    expect(result.value.fields[0]?.options).toEqual(["Salle de bain", "Cuisine"]);
    expect(result.value.guardrails).toEqual(["professional", "no_promise"]);
    expect(result.value.knowledge).toHaveLength(1);
    expect(result.value.systemPrompt).toContain("Tu es l'assistant de qualification");
    expect(result.value.renderTemplate).toContain("## Type de projet");
  });

  it("conserve un select sans options en texte", () => {
    const result = parseTemplateAiDraft(
      {
        ...RAW,
        fields: [{ label: "Choix", type: "select", required: false }],
      },
      { key: "modele" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields[0]?.type).toBe("text");
    expect(result.value.warnings.join(" ")).toContain("pas d'options");
  });

  it("refuse une réponse sans champ exploitable", () => {
    const result = parseTemplateAiDraft({ ...RAW, fields: [] }, { key: "modele" });
    expect(result.ok).toBe(false);
  });
});
