import { describe, expect, it } from "vitest";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import { buildFieldsGuide } from "@/domain/field-guide";
import { canonicalMultiValue, canonicalOption } from "@/domain/field-options";
import { validateTemplateData } from "@/domain/validate-template-data";

const TYPE_FIELD: TemplateField = {
  name: "type_organisation",
  label: "Type d’organisation",
  type: "select",
  required: true,
  options: ["Entreprise", "Société", "Organisation", "Association", "Personne physique"],
};

const PARTNERSHIP_FIELD: TemplateField = {
  name: "type_partenariat",
  label: "Type de partenariat",
  type: "multi",
  required: true,
  options: ["Financier", "Matériel", "Hébergement", "Expertise", "Visibilité", "Autre"],
};

describe("options de champs", () => {
  it("canonicalise la casse et les accents", () => {
    expect(canonicalOption(TYPE_FIELD, "entreprise")).toBe("Entreprise");
    expect(canonicalOption(TYPE_FIELD, "societe")).toBe("Société");
    expect(canonicalOption(TYPE_FIELD, "personne physique")).toBe("Personne physique");
    expect(canonicalOption(TYPE_FIELD, "inconnu")).toBeNull();
  });

  it("mappe une valeur multi inconnue vers Autre", () => {
    expect(canonicalMultiValue(PARTNERSHIP_FIELD, ["partenaire stratégique"])).toEqual({
      values: ["Autre"],
      invalid: [],
    });
  });

  it("valide et normalise une fiche", () => {
    const definition: TemplateDefinition = {
      key: "partenaire",
      label: "Partenaire",
      description: "",
      systemPrompt: "",
      fields: [TYPE_FIELD, PARTNERSHIP_FIELD],
      renderTemplate: "",
    };
    const result = validateTemplateData(definition, {
      type_organisation: "entreprise",
      type_partenariat: "partenaire stratégique",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type_organisation).toBe("Entreprise");
      expect(result.value.type_partenariat).toEqual(["Autre"]);
    }
  });

  it("le guide conversationnel n’expose pas les noms techniques", () => {
    const guide = buildFieldsGuide([
      TYPE_FIELD,
      { name: "site", label: "Site", type: "url", required: false },
    ]);
    expect(guide).toContain("Type d’organisation — obligatoire — select");
    expect(guide).toContain("valeurs autorisées : Entreprise | Société");
    expect(guide).toContain("Site — facultatif — url — format URL http(s)");
    expect(guide).not.toContain("[type_organisation]");
    expect(guide).not.toContain("[site]");
    expect(guide).toContain("Ne dis jamais que tout est complet");
  });

  it("le guide conversationnel ne fuit pas le champ d’une condition requiredIf", () => {
    const guide = buildFieldsGuide([
      { ...TYPE_FIELD, required: false },
      {
        name: "detail",
        label: "Détail",
        type: "text",
        required: false,
        requiredIf: { field: "type_organisation", equals: "Autre" },
      },
    ]);
    expect(guide).toContain("obligatoire si Type d’organisation vaut « Autre »");
    expect(guide).not.toContain("[type_organisation]");
  });

  it("le guide technique peut exposer les noms de champs pour l’extraction", () => {
    const guide = buildFieldsGuide(
      [TYPE_FIELD, { name: "site", label: "Site", type: "url", required: false }],
      { includeTechnicalNames: true },
    );
    expect(guide).toContain("Type d’organisation [type_organisation] — obligatoire — select");
    expect(guide).toContain("Site [site] — facultatif — url — format URL http(s)");
  });
});
