import { describe, expect, it } from "vitest";
import { resolveFieldName } from "@/domain/template-defaults";
import { validateTemplateDefinition } from "@/domain/template-schema";

function base(overrides: Record<string, unknown> = {}) {
  return {
    key: "test-modele",
    label: "Modèle de test",
    description: "",
    systemPrompt: "Tu es un assistant.",
    renderTemplate: "# {{titre}}",
    fields: [{ name: "titre", label: "Titre", type: "text", required: true }],
    ...overrides,
  };
}

describe("validateTemplateDefinition", () => {
  it("accepte un modèle valide", () => {
    const result = validateTemplateDefinition(base());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.key).toBe("test-modele");
      expect(result.value.fields).toHaveLength(1);
    }
  });

  it("accepte un exemple de réponse et le normalise", () => {
    const result = validateTemplateDefinition(
      base({
        fields: [
          {
            name: "budget",
            label: "Budget",
            type: "text",
            required: true,
            example: "  5 000 €  ",
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fields[0]?.example).toBe("5 000 €");
  });

  it("refuse une clé invalide", () => {
    const result = validateTemplateDefinition(base({ key: "Mauvaise Clé!" }));
    expect(result.ok).toBe(false);
  });

  it("refuse un type inconnu", () => {
    const result = validateTemplateDefinition(
      base({ fields: [{ name: "x", label: "X", type: "nombre", required: false }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("exige des options pour select et multi", () => {
    const noOptions = validateTemplateDefinition(
      base({ fields: [{ name: "s", label: "S", type: "select", required: true }] }),
    );
    expect(noOptions.ok).toBe(false);
    const withOptions = validateTemplateDefinition(
      base({
        fields: [{ name: "s", label: "S", type: "select", required: true, options: ["a", "b"] }],
      }),
    );
    expect(withOptions.ok).toBe(true);
  });

  it("refuse un requiredIf vers un champ inexistant", () => {
    const result = validateTemplateDefinition(
      base({
        fields: [
          { name: "a", label: "A", type: "text", required: false },
          {
            name: "b",
            label: "B",
            type: "text",
            required: false,
            requiredIf: { field: "inconnu", equals: "x" },
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuse deux règles requiredIf", () => {
    const result = validateTemplateDefinition(
      base({
        fields: [
          { name: "a", label: "A", type: "select", required: true, options: ["x", "y"] },
          {
            name: "b",
            label: "B",
            type: "text",
            required: false,
            requiredIf: { field: "a", equals: "x" },
          },
          {
            name: "c",
            label: "C",
            type: "text",
            required: false,
            requiredIf: { field: "a", equals: "y" },
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuse les noms de champs en double ou invalides", () => {
    const duplicate = validateTemplateDefinition(
      base({
        fields: [
          { name: "a", label: "A", type: "text", required: false },
          { name: "a", label: "A2", type: "text", required: false },
        ],
      }),
    );
    expect(duplicate.ok).toBe(false);
    const badName = validateTemplateDefinition(
      base({ fields: [{ name: "mon champ", label: "X", type: "text", required: false }] }),
    );
    expect(badName.ok).toBe(false);
  });
});

describe("validateTemplateDefinition — champ fichier (ADR-0034)", () => {
  it("accepte un champ fichier avec ses contraintes", () => {
    const result = validateTemplateDefinition(
      base({
        fields: [
          {
            name: "cin",
            label: "CIN",
            type: "file",
            required: true,
            file: { accept: ["image/png", "application/pdf"], maxFiles: 1, maxBytes: 1024 },
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.fields[0]?.file?.accept).toEqual(["image/png", "application/pdf"]);
  });

  it("refuse un champ fichier sans contraintes ou avec un MIME inconnu", () => {
    expect(
      validateTemplateDefinition(
        base({ fields: [{ name: "cin", label: "CIN", type: "file", required: true }] }),
      ).ok,
    ).toBe(false);
    expect(
      validateTemplateDefinition(
        base({
          fields: [
            {
              name: "cin",
              label: "CIN",
              type: "file",
              required: true,
              file: { accept: ["application/zip"], maxFiles: 1, maxBytes: 1024 },
            },
          ],
        }),
      ).ok,
    ).toBe(false);
  });
});

describe("resolveFieldName — compatibilité des clés existantes", () => {
  it("conserve la clé d'un champ legacy et ne renomme pas statut", () => {
    expect(resolveFieldName("Statut de lancement", "statut")).toBe("statut");
  });

  it("dérive la clé d'un nouveau champ depuis son libellé", () => {
    expect(resolveFieldName("Statut de lancement", "")).toBe("statut_de_lancement");
  });
});
