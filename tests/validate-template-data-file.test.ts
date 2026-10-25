import { describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { validateTemplateData } from "@/domain/validate-template-data";

const DEFINITION: TemplateDefinition = {
  key: "demo",
  label: "Démo",
  description: "",
  systemPrompt: "x",
  fields: [
    { name: "nom", label: "Nom", type: "text", required: true },
    {
      name: "cin",
      label: "CIN",
      type: "file",
      required: true,
      file: { accept: ["image/png"], maxFiles: 1, maxBytes: 1024 },
    },
  ],
  renderTemplate: "# {{nom}}\n\n{{cin}}\n",
};

describe("validateTemplateData — champ fichier", () => {
  it("accepte une pièce présente et ne met pas la valeur dans data", () => {
    const result = validateTemplateData(DEFINITION, { nom: "Jean" }, { cin: 1 });
    expect(result).toEqual({ ok: true, value: { nom: "Jean" } });
  });

  it("refuse un champ fichier requis sans pièce", () => {
    const result = validateTemplateData(DEFINITION, { nom: "Jean" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/CIN/);
  });

  it("refuse trop de pièces pour le champ", () => {
    const result = validateTemplateData(DEFINITION, { nom: "Jean" }, { cin: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/1 fichier/);
  });
});
