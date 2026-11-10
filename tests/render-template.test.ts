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
      name: "priorite",
      label: "Priorité",
      type: "select",
      required: true,
      options: ["basse", "haute"],
    },
    {
      name: "categories",
      label: "Catégories",
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
      { priorite: "haute", categories: ["site web", "SaaS"] },
      {},
    );
    expect(vars.categories).toBe("- site web\n- SaaS");
    expect(vars.priorite_haute).toBe("1");
    expect(vars.priorite_basse ?? "").toBe("");
    expect(vars.champs_guide).toContain("- Priorité");
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
      { priorite: "basse", categories: ["site web"] },
      {},
      {},
      { cin: ["cin.png", "cin-verso.png"] },
    );
    expect(vars.cin).toBe("- cin.png\n- cin-verso.png");
    expect(vars.champs_guide).toContain("CIN");
    expect(vars.champs_guide).toContain("pièce jointe");
  });

  it("sépare un tableau Markdown de son libellé", () => {
    const child: TemplateDefinition = {
      key: "item",
      label: "Élément",
      description: "",
      systemPrompt: "",
      fields: [{ name: "nom", label: "Nom", type: "text", required: true }],
      renderTemplate: "# Élément",
    };
    const withTable: TemplateDefinition = {
      ...DEFINITION,
      fields: [
        {
          name: "items",
          label: "Lignes",
          type: "tableau_de_fiches",
          required: true,
          ficheKey: "item",
        },
      ],
      subFiches: [child],
      renderTemplate: "# Fiche\n\n- **Lignes** : {{items}}",
    };
    const out = renderTemplateMarkdown({
      definition: withTable,
      data: { items: [{ nom: "A" }, { nom: "B" }] },
      serverVars: {},
      date: "2026-01-01",
    });
    expect(out).toContain("- **Lignes** : \n\n| Nom |");
    expect(out).toContain("| A |");
    expect(out).toContain("| B |");
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

describe("buildRenderVariables — valeurs typées (ADR-0067)", () => {
  it("rend un nombre 0 et une date", async () => {
    const { buildRenderVariables } = await import("@/domain/template-variables");
    const typed: TemplateDefinition = {
      key: "typed",
      label: "Typed",
      description: "",
      systemPrompt: "x",
      fields: [
        { name: "loyer", label: "Loyer", type: "number", required: true, unit: "€" },
        { name: "disponible_le", label: "Disponible le", type: "date", required: false },
        { name: "photo", label: "Photo", type: "image", required: false },
      ],
      renderTemplate: "{{loyer}} {{disponible_le}} {{photo}}",
    };
    const vars = buildRenderVariables(
      typed,
      {
        loyer: 0,
        disponible_le: "2026-01-01",
        photo: "https://exemple.mg/photo.jpg",
      },
      {},
    );
    expect(vars.loyer).toBe("0");
    expect(vars.disponible_le).toBe("2026-01-01");
    expect(vars.photo).toBe("https://exemple.mg/photo.jpg");
  });
});
