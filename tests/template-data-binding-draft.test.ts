import { describe, expect, it } from "vitest";
import { childCandidates, placeholders } from "@/components/templates/TemplateDataBindingsEditor";
import type { TemplateDataContract } from "@/domain/data-contracts";

const contract: TemplateDataContract = {
  key: "library",
  label: "Bibliothèque",
  description: "",
  version: 1,
  loading: "lazy",
  inputs: [],
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
            tags: { type: "array", items: { type: "string" } },
            title: { type: "string" },
          },
        },
      },
    },
  },
};

describe("brouillon de binding — placeholders et enfants", () => {
  it("détecte, trie et dédoublonne les $n", () => {
    expect(placeholders("SELECT 1 WHERE a = $2 AND b = $1 AND c = $2")).toEqual([1, 2]);
    expect(placeholders("SELECT 1")).toEqual([]);
    expect(placeholders("SELECT '$1' AS littéral")).toEqual([1]);
  });

  it("ne propose que les tableaux imbriqués du tableau racine", () => {
    expect(childCandidates(contract, "books")).toEqual(["pages", "tags"]);
    expect(childCandidates(contract, "missing")).toEqual([]);
    expect(childCandidates(contract, "books")).not.toContain("title");
  });
});
