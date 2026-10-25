import { describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { renderTemplate, renderTemplateMarkdown } from "@/domain/render-template";

const DEFINITION: TemplateDefinition = {
  key: "demo",
  label: "Démo",
  description: "",
  systemPrompt: "x",
  fields: [
    {
      name: "statut",
      label: "Statut",
      type: "select",
      required: true,
      options: ["initier", "reprendre"],
    },
    {
      name: "plateformes",
      label: "Plateformes",
      type: "multi",
      required: true,
      options: ["site web"],
    },
  ],
  renderTemplate: "# {{titre}}",
};

describe("renderTemplate", () => {
  it("substitue les variables (inconnues = vide)", () => {
    expect(renderTemplate("Bonjour {{nom}} et {{inconnu}} !", { nom: "Aina" })).toBe(
      "Bonjour Aina et  !",
    );
  });

  it("affiche les blocs {{#if}} quand la valeur est non vide", () => {
    expect(renderTemplate("A{{#if x}}B{{x}}{{/if}}C", { x: "1" })).toBe("AB1C");
    expect(renderTemplate("A{{#if x}}B{{/if}}C", { x: "   " })).toBe("AC");
    expect(renderTemplate("A{{#if x}}B{{/if}}C", {})).toBe("AC");
  });

  it("laisse le texte malformé tel quel (jamais d'exception)", () => {
    expect(renderTemplate("A{{#if x}}B", { x: "1" })).toBe("A{{#if x}}B");
    // `{{#if}}` sans nom n'est pas une balise valide : rendu littéral.
    expect(renderTemplate("A{{#if}}B{{/if}}", {})).toBe("A{{#if}}B{{/if}}");
  });

  it("dérive multi en puces et select en booléens", async () => {
    const { buildRenderVariables } = await import("@/domain/template-variables");
    const vars = buildRenderVariables(
      DEFINITION,
      { statut: "reprendre", plateformes: ["site web", "SaaS"] },
      {},
    );
    expect(vars.plateformes).toBe("- site web\n- SaaS");
    expect(vars.statut_reprendre).toBe("1");
    expect(vars.statut_initier ?? "").toBe("");
    expect(vars.champs_guide).toContain("- Statut");
  });

  it("rend les noms de pièces jointes d'un champ fichier", async () => {
    const { buildRenderVariables } = await import("@/domain/template-variables");
    const withFile: TemplateDefinition = {
      ...DEFINITION,
      fields: [
        ...DEFINITION.fields,
        {
          name: "cin",
          label: "CIN",
          type: "file",
          required: true,
          file: { accept: ["image/png"], maxFiles: 1, maxBytes: 1024 },
        },
      ],
      renderTemplate: "# CIN\n\n{{cin}}\n",
    };
    const vars = buildRenderVariables(
      withFile,
      { statut: "initier", plateformes: ["site web"] },
      {},
      {},
      { cin: ["cin.png", "cin-verso.png"] },
    );
    expect(vars.cin).toBe("- cin.png\n- cin-verso.png");
    expect(vars.champs_guide).toContain("CIN");
    expect(vars.champs_guide).toContain("pièce jointe");
  });

  it("rend un markdown déterministe (trim + saut final)", () => {
    const out = renderTemplateMarkdown({
      definition: DEFINITION,
      data: {},
      serverVars: { date: "2026-01-01", titre: "Démo" },
      date: "2026-01-01",
    });
    expect(out).toBe("# Démo\n");
  });
});
