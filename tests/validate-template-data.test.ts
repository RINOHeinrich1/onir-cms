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
      name: "categories",
      label: "Catégories",
      type: "multi",
      required: true,
      options: ["site web", "SaaS", "mobile", "automatisme background"],
    },
    { name: "description", label: "Description", type: "textarea", required: true },
    { name: "budget", label: "Budget", type: "text", required: true },
    { name: "contact", label: "Contact", type: "text", required: true },
    {
      name: "priorite",
      label: "Priorité",
      type: "select",
      required: true,
      options: ["basse", "haute"],
    },
    {
      name: "details",
      label: "Détails",
      type: "textarea",
      required: false,
      requiredIf: { field: "priorite", equals: "haute" },
    },
    { name: "site", label: "Site", type: "url", required: false },
    { name: "courriel", label: "Courriel", type: "email", required: false },
  ],
  renderTemplate: "# {{titre}}",
};

const BASE: Record<string, unknown> = {
  categories: ["site web"],
  description: "Vitrine.",
  budget: "1000",
  contact: "jean@exemple.mg",
  priorite: "basse",
};

describe("validateTemplateData — règles fiche-projet reproduites", () => {
  it("accepte des données complètes et normalise", () => {
    const result = validateTemplateData(DEFINITION, { ...BASE, categories: [" site web ", ""] });
    expect(result).toEqual({
      ok: true,
      value: {
        categories: ["site web"],
        description: "Vitrine.",
        budget: "1000",
        contact: "jean@exemple.mg",
        priorite: "basse",
      },
    });
  });

  it("signale chaque champ manquant", () => {
    const result = validateTemplateData(DEFINITION, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/Catégories/);
      expect(result.errors.join(" ")).toMatch(/Budget/);
    }
  });

  it("applique requiredIf (priorité haute ⇒ détails)", () => {
    const missing = validateTemplateData(DEFINITION, { ...BASE, priorite: "haute" });
    expect(missing.ok).toBe(false);
    const filled = validateTemplateData(DEFINITION, {
      ...BASE,
      priorite: "haute",
      details: "PHP 5",
    });
    expect(filled.ok).toBe(true);
  });

  it("valide types select/multi/url/email", () => {
    expect(validateTemplateData(DEFINITION, { ...BASE, priorite: "brouillon" }).ok).toBe(false);
    expect(validateTemplateData(DEFINITION, { ...BASE, categories: ["inconnu"] }).ok).toBe(false);
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
    const result = validatePartialTemplateData(DEFINITION, { site: "", categories: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ site: "", categories: [] });
  });

  it("refuse une valeur invalide fournie", () => {
    const result = validatePartialTemplateData(DEFINITION, { site: "pas-un-lien" });
    expect(result.ok).toBe(false);
  });
});

describe("validateTemplateData — champs number, date et image (ADR-0067)", () => {
  const TYPED: TemplateDefinition = {
    key: "typed",
    label: "Typed",
    description: "",
    systemPrompt: "x",
    fields: [
      { name: "loyer", label: "Loyer", type: "number", required: true, unit: "€" },
      { name: "disponible_le", label: "Disponible le", type: "date", required: false },
      { name: "photo", label: "Photo", type: "image", required: false },
    ],
    renderTemplate: "# {{loyer}}",
  };

  it("accepte un nombre et normalise une chaîne numérique", () => {
    const result = validateTemplateData(TYPED, { loyer: " 5 " });
    expect(result).toEqual({ ok: true, value: { loyer: 5 } });
  });

  it("ne considère pas 0 comme vide", () => {
    const result = validateTemplateData(TYPED, { loyer: 0 });
    expect(result).toEqual({ ok: true, value: { loyer: 0 } });
  });

  it("refuse un nombre invalide", () => {
    expect(validateTemplateData(TYPED, { loyer: "abc" }).ok).toBe(false);
    expect(validateTemplateData(TYPED, { loyer: "" }).ok).toBe(false);
  });

  it("accepte une date calendrier valide et refuse une date impossible", () => {
    expect(validateTemplateData(TYPED, { loyer: 1, disponible_le: "2026-02-28" }).ok).toBe(true);
    expect(validateTemplateData(TYPED, { loyer: 1, disponible_le: "2026-02-30" }).ok).toBe(false);
    expect(validateTemplateData(TYPED, { loyer: 1, disponible_le: "01/02/2026" }).ok).toBe(false);
  });

  it("accepte une image http(s) et refuse une valeur non URL", () => {
    expect(
      validateTemplateData(TYPED, { loyer: 1, photo: "https://exemple.mg/photo.jpg" }).ok,
    ).toBe(true);
    expect(validateTemplateData(TYPED, { loyer: 1, photo: "photo.jpg" }).ok).toBe(false);
  });

  it("normalise l'effacement partiel d'un nombre en chaîne vide", () => {
    const result = validatePartialTemplateData(TYPED, { loyer: "" });
    expect(result).toEqual({ ok: true, value: { loyer: "" } });
  });
});
