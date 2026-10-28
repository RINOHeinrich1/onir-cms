import { describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { validatePartialTemplateData, validateTemplateData } from "@/domain/validate-template-data";

const DEFINITION: TemplateDefinition = {
  key: "fiche-projet",
  label: "Fiche de prospection",
  description: "",
  systemPrompt: "x",
  fields: [
    {
      name: "plateformes",
      label: "Plateformes",
      type: "multi",
      required: true,
      options: ["site web", "SaaS", "mobile", "automatisme background"],
    },
    { name: "description", label: "Description", type: "textarea", required: true },
    { name: "budget", label: "Budget", type: "text", required: true },
    { name: "contact", label: "Contact", type: "text", required: true },
    {
      name: "statut",
      label: "Statut",
      type: "select",
      required: true,
      options: ["initier", "reprendre"],
    },
    {
      name: "contraintesTechno",
      label: "Contraintes",
      type: "textarea",
      required: false,
      requiredIf: { field: "statut", equals: "reprendre" },
    },
    { name: "site", label: "Site", type: "url", required: false },
    { name: "courriel", label: "Courriel", type: "email", required: false },
  ],
  renderTemplate: "# {{titre}}",
};

const BASE: Record<string, unknown> = {
  plateformes: ["site web"],
  description: "Vitrine.",
  budget: "1000",
  contact: "jean@exemple.mg",
  statut: "initier",
};

describe("validateTemplateData — règles fiche-projet reproduites", () => {
  it("accepte des données complètes et normalise", () => {
    const result = validateTemplateData(DEFINITION, { ...BASE, plateformes: [" site web ", ""] });
    expect(result).toEqual({
      ok: true,
      value: {
        plateformes: ["site web"],
        description: "Vitrine.",
        budget: "1000",
        contact: "jean@exemple.mg",
        statut: "initier",
      },
    });
  });

  it("signale chaque champ manquant", () => {
    const result = validateTemplateData(DEFINITION, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/Plateformes/);
      expect(result.errors.join(" ")).toMatch(/Budget/);
    }
  });

  it("applique requiredIf (reprise ⇒ contraintes)", () => {
    const missing = validateTemplateData(DEFINITION, { ...BASE, statut: "reprendre" });
    expect(missing.ok).toBe(false);
    const filled = validateTemplateData(DEFINITION, {
      ...BASE,
      statut: "reprendre",
      contraintesTechno: "PHP 5",
    });
    expect(filled.ok).toBe(true);
  });

  it("valide types select/multi/url/email", () => {
    expect(validateTemplateData(DEFINITION, { ...BASE, statut: "brouillon" }).ok).toBe(false);
    expect(validateTemplateData(DEFINITION, { ...BASE, plateformes: ["inconnu"] }).ok).toBe(false);
    expect(validateTemplateData(DEFINITION, { ...BASE, site: "pas-un-lien" }).ok).toBe(false);
    expect(validateTemplateData(DEFINITION, { ...BASE, site: "https://exemple.mg" }).ok).toBe(true);
    expect(validateTemplateData(DEFINITION, { ...BASE, courriel: "pas-un-email" }).ok).toBe(false);
  });
});

describe("validatePartialTemplateData — édition des champs collectés", () => {
  it("ignore les champs absents et valide seulement les champs fournis", () => {
    const result = validatePartialTemplateData(DEFINITION, { site: "https://exemple.mg" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ site: "https://exemple.mg" });
  });

  it("normalise un effacement manuel", () => {
    const result = validatePartialTemplateData(DEFINITION, { site: "", plateformes: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ site: "", plateformes: [] });
  });

  it("refuse une valeur invalide fournie", () => {
    const result = validatePartialTemplateData(DEFINITION, { site: "pas-un-lien" });
    expect(result.ok).toBe(false);
  });
});
