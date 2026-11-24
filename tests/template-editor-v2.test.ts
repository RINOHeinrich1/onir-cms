import { describe, expect, it } from "vitest";
import {
  bindingsForRegion,
  resolveDynamicRegion,
  validateTemplateEditorBlock,
} from "@/domain/template-editor";
import type { TemplateParamSchema } from "@/domain/template-params";

const itemSchema: TemplateParamSchema = {
  key: "blocks",
  label: "Blocs",
  description: "",
  type: "array",
  default: [],
  minItems: 0,
  maxItems: 100,
  items: {
    type: "object",
    default: {},
    properties: [
      { key: "id", label: "Id", description: "", type: "string", default: "" },
      { key: "kind", label: "Kind", description: "", type: "string", default: "" },
      { key: "name", label: "Nom", description: "", type: "string", default: "" },
    ],
  },
};

const params: TemplateParamSchema[] = [
  itemSchema,
  { key: "global_theme", label: "Thème", description: "", type: "string", default: "" },
];

function v2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    regions: [{ id: "main", label: "Main" }],
    bindings: [{ param: "global_theme", regions: ["main"], category: "appearance" }],
    collections: [
      {
        param: "blocks",
        label: "Composants",
        itemKey: "id",
        itemLabel: "name",
        itemKind: "kind",
        labelFallback: ["kind", "id"],
      },
    ],
    dynamicRegions: [{ idPattern: "block:{id}", collection: "blocks", keyField: "id" }],
    fields: [
      {
        param: "blocks",
        field: "name",
        visibleWhen: { field: "kind", equals: "hero" },
      },
    ],
    ...overrides,
  };
}

describe("Editor Contract V2", () => {
  it("accepte collections, régions dynamiques et conditions", () => {
    const result = validateTemplateEditorBlock(v2(), params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    expect(result.value.version).toBe(2);
    if (result.value.version !== 2) return;
    expect(result.value.collections?.[0]?.itemKey).toBe("id");
    expect(result.value.dynamicRegions?.[0]?.idPattern).toBe("block:{id}");
    expect(result.value.fields?.[0]?.visibleWhen?.equals).toBe("hero");
  });

  it("refuse un itemKey absent", () => {
    const result = validateTemplateEditorBlock(
      v2({
        collections: [
          {
            param: "blocks",
            label: "Composants",
            itemKey: "absent",
          },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.field.includes("itemKey"))).toBe(true);
  });

  it("refuse une collection inconnue dans une région dynamique", () => {
    const result = validateTemplateEditorBlock(
      v2({
        dynamicRegions: [{ idPattern: "block:{id}", collection: "absente", keyField: "id" }],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.message === "collection inconnue")).toBe(true);
  });

  it("laisse le contrat V1 inchangé", () => {
    const result = validateTemplateEditorBlock(
      {
        version: 1,
        regions: [{ id: "main", label: "Main" }],
        bindings: [{ param: "global_theme", regions: ["main"], category: "appearance" }],
      },
      params,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    expect(result.value.version).toBe(1);
  });
});

describe("régions dynamiques V2", () => {
  it("résout block:hero_main vers l'élément stable", () => {
    const result = validateTemplateEditorBlock(
      v2({
        bindings: [
          {
            param: "blocks",
            itemKey: "id",
            itemId: "hero_main",
            regions: ["main"],
            category: "content",
          },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const resolved = resolveDynamicRegion(result.value, "block:hero_main");
    expect(resolved).toMatchObject({
      collection: "blocks",
      keyField: "id",
      itemId: "hero_main",
    });
    expect(bindingsForRegion(result.value, "block:hero_main")).toHaveLength(1);
    expect(bindingsForRegion(result.value, "block:card_one")).toHaveLength(0);
  });
});
