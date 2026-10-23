import { describe, expect, it } from "vitest";
import {
  DATA_CONTRACT_LIMITS,
  type JsonSchemaNode,
  validateDataValue,
  validateTemplateDataBlock,
} from "@/domain/data-contracts";

const schema: JsonSchemaNode = {
  type: "object",
  required: ["books"],
  additionalProperties: false,
  properties: {
    books: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        required: ["id", "title", "pages"],
        additionalProperties: false,
        properties: {
          id: { type: "string", maxLength: 8 },
          title: { type: "string", minLength: 1, maxLength: 20 },
          pages: {
            type: "array",
            items: {
              type: "object",
              required: ["index", "text"],
              additionalProperties: false,
              properties: {
                index: { type: "integer", minimum: 0 },
                text: { type: "string", maxLength: 50 },
                image: { type: "string", format: "uri" },
              },
            },
          },
        },
      },
    },
  },
};

function contract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "library",
    label: "Bibliothèque",
    description: "Livres et pages",
    version: 1,
    schema,
    ...overrides,
  };
}

function block(contracts: unknown[]): Record<string, unknown> {
  return { contracts };
}

describe("validateTemplateDataBlock — contrats (ADR-0026)", () => {
  it("accepte un contrat valide et applique les défauts", () => {
    const result = validateTemplateDataBlock(block([contract()]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.value[0];
    if (!value) return;
    expect(value.key).toBe("library");
    expect(value.loading).toBe("lazy");
    expect(value.inputs).toEqual([]);
    expect(value.schema.additionalProperties).toBe(false);
    expect(value.schema.properties?.books?.type).toBe("array");
  });

  it("conserve loading eager et les entrées déclarées", () => {
    const result = validateTemplateDataBlock(
      block([
        contract({
          loading: "eager",
          inputs: [{ key: "book_id", type: "string", required: true }],
        }),
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.loading).toBe("eager");
      expect(result.value[0]?.inputs).toEqual([{ key: "book_id", type: "string", required: true }]);
    }
  });

  it("refuse un bloc non objet et un contracts non tableau", () => {
    expect(validateTemplateDataBlock(null).ok).toBe(false);
    expect(validateTemplateDataBlock({ contracts: {} }).ok).toBe(false);
  });

  it("refuse les clés inconnues du bloc et des contrats", () => {
    expect(validateTemplateDataBlock({ contracts: [contract()], extra: 1 }).ok).toBe(false);
    expect(validateTemplateDataBlock(block([contract({ hidden: true })])).ok).toBe(false);
  });

  it("refuse un schéma avec des mots-clés hors sous-ensemble", () => {
    const withRef = contract({ schema: { type: "object", $ref: "#/x", properties: {} } });
    const withPattern = contract({ schema: { type: "string", pattern: "^a" } });
    expect(validateTemplateDataBlock(block([withRef])).ok).toBe(false);
    expect(validateTemplateDataBlock(block([withPattern])).ok).toBe(false);
  });

  it("refuse required incohérent et additionalProperties non booléen", () => {
    const badRequired = contract({
      schema: { type: "object", required: ["missing"], properties: { id: { type: "string" } } },
    });
    const badAdditional = contract({
      schema: { type: "object", additionalProperties: "yes", properties: {} },
    });
    expect(validateTemplateDataBlock(block([badRequired])).ok).toBe(false);
    expect(validateTemplateDataBlock(block([badAdditional])).ok).toBe(false);
  });

  it("refuse un items absent, un format inconnu et une borne incohérente", () => {
    expect(validateTemplateDataBlock(block([contract({ schema: { type: "array" } })])).ok).toBe(
      false,
    );
    expect(
      validateTemplateDataBlock(block([contract({ schema: { type: "string", format: "uuid" } })]))
        .ok,
    ).toBe(false);
    expect(
      validateTemplateDataBlock(
        block([contract({ schema: { type: "number", minimum: 10, maximum: 1 } })]),
      ).ok,
    ).toBe(false);
  });

  it("refuse les clés dupliquées et un type d'entrée inconnu", () => {
    expect(validateTemplateDataBlock(block([contract(), contract({ label: "Doublon" })])).ok).toBe(
      false,
    );
    const badInput = contract({ inputs: [{ key: "book_id", type: "date" }] });
    expect(validateTemplateDataBlock(block([badInput])).ok).toBe(false);
  });

  it("refuse plus de contrats que la limite", () => {
    const many = Array.from({ length: DATA_CONTRACT_LIMITS.maxContracts + 1 }, (_, index) =>
      contract({ key: `library_${index}` }),
    );
    expect(validateTemplateDataBlock(block(many)).ok).toBe(false);
  });
});

describe("validateDataValue — données à l'exécution", () => {
  const doc = {
    books: [
      {
        id: "b1",
        title: "Titre",
        pages: [
          { index: 0, text: "Bonjour" },
          { index: 1, text: "Suite", image: "https://example.com/p.jpg" },
        ],
      },
    ],
  };

  it("accepte un document conforme", () => {
    expect(validateDataValue(schema, doc)).toEqual([]);
  });

  it("signale propriété requise absente et propriété non déclarée", () => {
    const missing = validateDataValue(schema, { books: [{ id: "b1", pages: [] }] });
    expect(missing.some((error) => error.path.endsWith("title"))).toBe(true);

    const extra = validateDataValue(schema, { ...doc, unknown: true });
    expect(extra.some((error) => error.path.endsWith("unknown"))).toBe(true);
  });

  it("signale types, bornes, formats et entiers", () => {
    const wrongType = validateDataValue(schema, { books: "nope" });
    expect(wrongType[0]?.message).toContain("tableau");

    const tooLong = validateDataValue(schema, {
      books: [{ id: "b1", title: "x".repeat(21), pages: [] }],
    });
    expect(tooLong.some((error) => error.message.includes("longueur"))).toBe(true);

    const badUri = validateDataValue(schema, {
      books: [
        {
          id: "b1",
          title: "ok",
          pages: [{ index: 0, text: "t", image: "data:image/png;base64,aa" }],
        },
      ],
    });
    expect(badUri.some((error) => error.message.includes("format"))).toBe(true);

    const notInt = validateDataValue(schema, {
      books: [{ id: "b1", title: "ok", pages: [{ index: 1.5, text: "t" }] }],
    });
    expect(notInt.some((error) => error.message.includes("entier"))).toBe(true);

    const tooMany = validateDataValue(schema, {
      books: [doc.books[0], doc.books[0], doc.books[0]],
    });
    expect(tooMany.some((error) => error.message.includes("plus de"))).toBe(true);
  });

  it("valide enum, const et booléens", () => {
    const enumSchema: JsonSchemaNode = { type: "string", enum: ["a", "b"] };
    expect(validateDataValue(enumSchema, "a")).toEqual([]);
    expect(validateDataValue(enumSchema, "c")).toHaveLength(1);
    expect(validateDataValue({ type: "boolean" }, 1)).toHaveLength(1);
  });
});
