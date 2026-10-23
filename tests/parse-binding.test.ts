import { describe, expect, it } from "vitest";
import {
  parseBindingFields,
  parseChildren,
} from "@/app/api/visual-templates/[id]/data-bindings/_lib/parse-binding";
import { ValidationError } from "@/application/errors";
import type { TemplateDataContract } from "@/domain/data-contracts";

const contract: TemplateDataContract = {
  key: "library",
  label: "Bibliothèque",
  description: "",
  version: 1,
  loading: "lazy",
  inputs: [{ key: "book_id", type: "string", required: false }],
  schema: {
    type: "object",
    required: ["books"],
    properties: {
      books: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "pages"],
          properties: {
            id: { type: "string" },
            pages: {
              type: "array",
              items: { type: "object", properties: { text: { type: "string" } } },
            },
          },
        },
      },
    },
  },
};

describe("parseBindingFields — erreurs de saisie (pas de 500)", () => {
  it("refuse une requête vide avec une erreur de validation", () => {
    expect(() => parseBindingFields({ queryText: "" }, contract, new Set())).toThrow(
      ValidationError,
    );
    expect(() => parseBindingFields({ queryText: "" }, contract, new Set())).toThrow(
      /requête SQL requise/i,
    );
  });

  it("refuse une instruction non SELECT avec une erreur de validation", () => {
    expect(() =>
      parseBindingFields(
        { queryText: "UPDATE template_read.v_medias SET actif=false" },
        contract,
        new Set(),
      ),
    ).toThrow(ValidationError);
  });

  it("refuse un enfant sans SQL valide", () => {
    expect(() =>
      parseChildren([{ path: "pages", query_text: "", foreign_key: "book_id" }]),
    ).toThrow(ValidationError);
  });

  it("accepte une source valide et mappe les entrées", () => {
    const fields = parseBindingFields(
      {
        name: "Variante",
        queryText: "SELECT id, titre AS title FROM template_read.v_connaissances WHERE id = $1",
        rootPath: "books",
        rootKey: "id",
        children: [],
        queryInputs: [{ index: 1, from: "input:book_id" }],
        cacheTtlSeconds: 60,
        maxRows: 300,
        enabled: false,
      },
      contract,
      new Set(),
    );
    expect(fields.name).toBe("Variante");
    expect(fields.queryInputs).toEqual([{ index: 1, from: "input:book_id" }]);
    expect(fields.maxRows).toBe(300);
  });
});
