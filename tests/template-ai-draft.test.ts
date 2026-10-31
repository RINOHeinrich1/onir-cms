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
  fallback: {
    enabled: true,
    intro: "L’assistant est indisponible.",
    questions: [{ id: "zone", label: "Quelle est votre zone ?", answer: "Lyon et métropole." }],
    showCollectionForm: true,
  },
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
    expect(result.value.guardrails).toEqual(["professional", "no_promise", "inconnu"]);
    expect(result.value.knowledge).toHaveLength(1);
    expect(result.value.systemPrompt).toContain("Tu es l'assistant de qualification");
    expect(result.value.renderTemplate).toContain("## Type de projet");
    expect(result.value.fallback.enabled).toBe(true);
    expect(result.value.fallback.questions[0]?.id).toBe("zone");
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

  it("accepte un modèle sans champ (chat conversationnel)", () => {
    const result = parseTemplateAiDraft({ ...RAW, fields: [] }, { key: "modele" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields).toEqual([]);
    expect(result.value.systemPrompt).not.toContain("Informations à réunir");
    expect(result.value.fallback.showCollectionForm).toBe(false);
  });

  it("conserve une langue fixe, un ton libre et un garde-fou personnalisé", () => {
    const result = parseTemplateAiDraft(
      {
        ...RAW,
        language: { mode: "fixed", value: "malgache" },
        tone: "chaleureux et très direct",
        guardrails: ["Ne jamais parler de concurrence."],
        extraInstructions: "Propose un rendez-vous.",
      },
      { key: "modele" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.language).toEqual({ mode: "fixed", value: "malgache" });
    expect(result.value.tone).toBe("chaleureux et très direct");
    expect(result.value.guardrails).toEqual(["Ne jamais parler de concurrence."]);
    expect(result.value.settings.extraInstructions).toBe("Propose un rendez-vous.");
    expect(result.value.systemPrompt).toContain("Tu réponds en malgache.");
  });
});
