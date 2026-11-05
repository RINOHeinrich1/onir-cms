import { describe, expect, it } from "vitest";
import type { TemplateField } from "@/domain/entities/chat-template";
import { operatorsForFieldType } from "@/domain/fiche-search-operators";
import { isFicheSortModeExecutable, MAX_CONDITIONS, MAX_LIMIT } from "@/domain/fiche-search-tool";
import { defaultSearchToolConfig, parseSearchToolConfig } from "@/domain/fiche-search-tool-config";
import {
  type SearchableFicheDefinition,
  validateSearchRequest,
} from "@/domain/fiche-search-validation";

const FIELDS: TemplateField[] = [
  { name: "titre", label: "Titre", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea", required: false },
  { name: "site", label: "Site", type: "url", required: false },
  { name: "email", label: "Email", type: "email", required: false },
  {
    name: "ville",
    label: "Ville",
    type: "select",
    required: false,
    options: ["Antananarivo", "Toamasina"],
  },
  { name: "tags", label: "Tags", type: "multi", required: false },
  { name: "loyer", label: "Loyer", type: "number", required: false },
  { name: "disponible", label: "Disponible", type: "date", required: false },
  { name: "photo", label: "Photo", type: "image", required: false },
  { name: "cin", label: "CIN", type: "file", required: false },
];

const MAISON: SearchableFicheDefinition = { key: "maison", label: "Maison", fields: FIELDS };
const TERRAIN: SearchableFicheDefinition = {
  key: "terrain",
  label: "Terrain",
  fields: FIELDS.filter((field) => field.name !== "ville"),
};

const DEFINITIONS = { maison: MAISON, terrain: TERRAIN };
const CONFIG = { ...defaultSearchToolConfig(), ficheTypes: ["maison", "terrain"] };

function validate(input: Record<string, unknown>, config = CONFIG, definitions = DEFINITIONS) {
  return validateSearchRequest(input, definitions, config);
}

describe("matrice des opérateurs (ADR-0067 §4.6)", () => {
  it("applique exactement la matrice par type de champ", () => {
    expect(operatorsForFieldType("text")).toEqual([
      "eq",
      "neq",
      "contains",
      "starts_with",
      "ends_with",
      "in",
      "exists",
      "is_empty",
    ]);
    expect(operatorsForFieldType("textarea")).toEqual(operatorsForFieldType("text"));
    expect(operatorsForFieldType("url")).toEqual(operatorsForFieldType("text"));
    expect(operatorsForFieldType("email")).toEqual(operatorsForFieldType("text"));
    expect(operatorsForFieldType("select")).toEqual([
      "eq",
      "neq",
      "in",
      "not_in",
      "exists",
      "is_empty",
    ]);
    expect(operatorsForFieldType("multi")).toEqual([
      "contains_any",
      "contains_all",
      "contains_none",
      "exists",
      "is_empty",
    ]);
    expect(operatorsForFieldType("number")).toEqual([
      "eq",
      "neq",
      "lt",
      "lte",
      "gt",
      "gte",
      "between",
      "in",
      "exists",
    ]);
    expect(operatorsForFieldType("date")).toEqual([
      "eq",
      "neq",
      "lt",
      "lte",
      "gt",
      "gte",
      "between",
      "exists",
    ]);
    expect(operatorsForFieldType("image")).toEqual(["exists", "is_empty"]);
    expect(operatorsForFieldType("file")).toEqual([]);
  });

  it("accepte chaque opérateur autorisé avec une valeur valide", () => {
    const cases: Array<{
      field: string;
      operator: string;
      value?: unknown;
    }> = [];
    const textValues: Record<string, unknown> = {
      eq: "Maison",
      neq: "Maison",
      contains: "mai",
      starts_with: "Mai",
      ends_with: "son",
      in: ["Maison", "Villa"],
      exists: undefined,
      is_empty: undefined,
    };
    for (const [operator, value] of Object.entries(textValues)) {
      cases.push({ field: "titre", operator, value });
    }
    const selectValues: Record<string, unknown> = {
      eq: "Antananarivo",
      neq: "Antananarivo",
      in: ["Antananarivo"],
      not_in: ["Toamasina"],
      exists: undefined,
      is_empty: undefined,
    };
    for (const [operator, value] of Object.entries(selectValues)) {
      cases.push({ field: "ville", operator, value });
    }
    const multiValues: Record<string, unknown> = {
      contains_any: ["a"],
      contains_all: ["a", "b"],
      contains_none: ["c"],
      exists: undefined,
      is_empty: undefined,
    };
    for (const [operator, value] of Object.entries(multiValues)) {
      cases.push({ field: "tags", operator, value });
    }
    const numberValues: Record<string, unknown> = {
      eq: 5,
      neq: 5,
      lt: 5,
      lte: 5,
      gt: 5,
      gte: 5,
      between: [1, 5],
      in: [1, 5],
      exists: undefined,
    };
    for (const [operator, value] of Object.entries(numberValues)) {
      cases.push({ field: "loyer", operator, value });
    }
    const dateValues: Record<string, unknown> = {
      eq: "2026-11-01",
      neq: "2026-11-01",
      lt: "2026-11-02",
      lte: "2026-11-02",
      gt: "2026-10-31",
      gte: "2026-10-31",
      between: ["2026-11-01", "2026-11-30"],
      exists: undefined,
    };
    for (const [operator, value] of Object.entries(dateValues)) {
      cases.push({ field: "disponible", operator, value });
    }
    cases.push({ field: "photo", operator: "exists" });
    cases.push({ field: "photo", operator: "is_empty" });

    for (const entry of cases) {
      const result = validate({ conditions: [entry] });
      expect(result, `${entry.field}.${entry.operator}`).toEqual(
        expect.objectContaining({ ok: true }),
      );
    }
  });

  it("rejette un opérateur incompatible avec le type du champ", () => {
    expect(
      validate({ conditions: [{ field: "titre", operator: "contains_any", value: ["a"] }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "loyer", operator: "contains", value: "5" }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "ville", operator: "contains", value: "Ant" }] }),
    ).toMatchObject({ ok: false });
    expect(validate({ conditions: [{ field: "cin", operator: "exists" }] })).toMatchObject({
      ok: false,
    });
  });

  it("rejette les valeurs mal typées (nombre texte, date invalide, select inconnu, multi)", () => {
    expect(
      validate({ conditions: [{ field: "loyer", operator: "lt", value: "5" }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "disponible", operator: "eq", value: "2026-13-40" }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "disponible", operator: "eq", value: "01/11/2026" }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "ville", operator: "eq", value: "Paris" }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "tags", operator: "contains_any", value: "a" }] }),
    ).toMatchObject({ ok: false });
  });

  it("exige deux bornes pour between et les ordonne", () => {
    expect(
      validate({ conditions: [{ field: "loyer", operator: "between", value: [1] }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "loyer", operator: "between", value: [5, 1] }] }),
    ).toMatchObject({ ok: false });
    expect(
      validate({ conditions: [{ field: "loyer", operator: "between", value: [1, 5] }] }),
    ).toMatchObject({ ok: true });
  });
});

describe("validation de la requête", () => {
  it("limite le nombre de conditions et la limite de résultats", () => {
    const conditions = Array.from({ length: MAX_CONDITIONS + 1 }, () => ({
      field: "titre",
      operator: "eq",
      value: "Maison",
    }));
    expect(validate({ conditions })).toMatchObject({ ok: false });
    expect(validate({ limit: MAX_LIMIT + 1 })).toMatchObject({ ok: false });
    expect(validate({ limit: 0 })).toMatchObject({ ok: false });
    expect(validate({ limit: MAX_LIMIT })).toMatchObject({ ok: true });
  });

  it("rejette un champ absent de tous les types et exclut les types sans le champ", () => {
    expect(
      validate({ conditions: [{ field: "inconnu", operator: "eq", value: "x" }] }),
    ).toMatchObject({ ok: false });

    const result = validate({
      conditions: [{ field: "ville", operator: "eq", value: "Antananarivo" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ficheTypes).toEqual(["maison"]);
  });

  it("utilise uniquement les fiches de collecte configurées, sans override du modèle", () => {
    const config = { ...CONFIG, ficheTypes: ["terrain"] };
    const result = validate({ ficheTypes: ["maison"] }, config);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ficheTypes).toEqual(["terrain"]);
    expect(
      validate({ conditions: [{ field: "ville", operator: "eq", value: "Antananarivo" }] }, config),
    ).toMatchObject({ ok: false });
  });

  it("valide les dates de création et le texte de recherche", () => {
    expect(validate({ createdFrom: "2026-11-30", createdTo: "2026-11-01" })).toMatchObject({
      ok: false,
    });
    expect(validate({ query: 42 })).toMatchObject({ ok: false });
    expect(validate({ query: "maison" })).toMatchObject({ ok: true });
  });
});

describe("configuration versionnée de l'outil", () => {
  it("applique les défauts sûrs et accepte relevance structurellement", () => {
    expect(defaultSearchToolConfig()).toEqual({
      enabled: false,
      ficheTypes: [],
      statusMode: "hidden_fixed",
      fixedStatusKeys: [],
      sortMode: "fair_rotation",
    });
    expect(parseSearchToolConfig(undefined)).toEqual({
      ok: true,
      value: defaultSearchToolConfig(),
    });
    expect(defaultSearchToolConfig().enabled).toBe(false);
    expect(parseSearchToolConfig({ ...defaultSearchToolConfig(), enabled: true })).toMatchObject({
      ok: true,
      value: { enabled: true },
    });
    const parsed = parseSearchToolConfig({
      ficheTypes: ["maison", "maison"],
      statusMode: "internal_filter",
      fixedStatusKeys: ["publie"],
      sortMode: "relevance",
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        enabled: false,
        ficheTypes: ["maison"],
        statusMode: "internal_filter",
        fixedStatusKeys: ["publie"],
        sortMode: "relevance",
      },
    });
  });

  it("refuse les valeurs invalides", () => {
    expect(parseSearchToolConfig({ statusMode: "public" })).toMatchObject({ ok: false });
    expect(parseSearchToolConfig({ sortMode: "random" })).toMatchObject({ ok: false });
    expect(parseSearchToolConfig({ ficheTypes: ["Maison"] })).toMatchObject({ ok: false });
    expect(parseSearchToolConfig({ fixedStatusKeys: ["Publié"] })).toMatchObject({ ok: false });
  });

  it("refuse relevance à l'exécution", () => {
    expect(isFicheSortModeExecutable("relevance")).toBe(false);
    expect(isFicheSortModeExecutable("fair_rotation")).toBe(true);
    expect(isFicheSortModeExecutable("created_at")).toBe(true);
  });
});
