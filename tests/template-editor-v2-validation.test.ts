import { describe, expect, it } from "vitest";
import {
  resolveDynamicRegionItem,
  type TemplateEditorManifestV2,
  validateTemplateEditorBlock,
  validateTemplateEditorCollectionValues,
} from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";

const object = (key: string, fields: TemplateParamSchema[]): TemplateParamSchema => ({
  key,
  label: key,
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
      ...fields,
    ],
  },
});

const params: TemplateParamSchema[] = [
  object("blocks", [
    { key: "kind", label: "Kind", description: "", type: "string", default: "" },
    { key: "name", label: "Nom", description: "", type: "string", default: "" },
    { key: "columns", label: "Colonnes", description: "", type: "number", default: 1 },
    { key: "style_id", label: "Style", description: "", type: "string", default: "" },
  ]),
  object("style_profiles", [
    { key: "font_size", label: "Taille", description: "", type: "number", default: 1 },
    { key: "visibility", label: "Visibilité", description: "", type: "string", default: "" },
  ]),
  object("pages", [
    { key: "title", label: "Titre", description: "", type: "string", default: "" },
    { key: "header_id", label: "En-tête", description: "", type: "string", default: "" },
    { key: "footer_id", label: "Pied", description: "", type: "string", default: "" },
  ]),
  object("regions", [
    { key: "header_id", label: "En-tête", description: "", type: "string", default: "" },
  ]),
  object("placements", [
    { key: "parent_id", label: "Parent", description: "", type: "string", default: "" },
    { key: "parent_kind", label: "Type parent", description: "", type: "string", default: "" },
    { key: "child_id", label: "Enfant", description: "", type: "string", default: "" },
    { key: "position", label: "Position", description: "", type: "number", default: 0 },
    { key: "slot", label: "Slot", description: "", type: "string", default: "" },
  ]),
  {
    key: "site_settings",
    label: "Réglages",
    description: "",
    type: "object",
    default: {},
    properties: [
      {
        key: "chat_mode",
        label: "Mode",
        description: "",
        type: "select",
        default: "off",
        options: [
          { value: "off", label: "Off" },
          { value: "embedded", label: "Embedded" },
        ],
      },
      { key: "chat_page_id", label: "Page", description: "", type: "string", default: "" },
    ],
  },
];

const base = {
  version: 2,
  regions: [{ id: "main", label: "Main" }],
  bindings: [{ param: "site_settings", regions: ["main"], category: "content" }],
  collections: [
    { param: "blocks", label: "Composants", itemKey: "id", itemLabel: "name" },
    { param: "style_profiles", label: "Styles", itemKey: "id" },
    { param: "pages", label: "Pages", itemKey: "id" },
    { param: "regions", label: "Régions", itemKey: "id" },
    { param: "placements", label: "Placements", itemKey: "id" },
  ],
  dynamicRegions: [
    { idPattern: "block:{id}", collection: "blocks", keyField: "id" },
    { idPattern: "page:{id}", collection: "pages", keyField: "id" },
  ],
} satisfies Record<string, unknown>;

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...base, ...overrides };
}

describe("validation runtime V2", () => {
  it("valide groupes, valueLabels, références, structure et scopes", () => {
    const result = validateTemplateEditorBlock(
      valid({
        groups: [
          {
            param: "style_profiles",
            id: "advanced",
            label: "Avancé",
            collapsedByDefault: true,
            fields: ["font_size", "visibility"],
          },
          {
            param: "site_settings",
            id: "chat",
            label: "Chat",
            fields: ["chat_mode", "chat_page_id"],
          },
        ],
        valueLabels: {
          style_profiles: {
            font_size: { "-1": "Automatique" },
            visibility: { hidden: "Masqué" },
          },
          site_settings: {
            chat_mode: { embedded: "Intégré" },
          },
        },
        references: [
          {
            from: "blocks",
            field: "style_id",
            to: "style_profiles",
            targetKey: "id",
            optional: true,
            onDelete: "clear",
          },
          {
            from: "placements",
            field: "parent_id",
            targets: { page: "pages", region: "regions", block: "blocks" },
            discriminator: "parent_kind",
            targetKey: "id",
            onDelete: "cascade",
          },
          {
            from: "pages",
            field: "header_id",
            to: "regions",
            targetKey: "id",
            onDelete: "clear",
          },
        ],
        structure: {
          roots: "pages",
          regions: { collection: "regions", fields: ["header_id"] },
          children: {
            collection: "blocks",
            through: "placements",
            parentKey: "parent_id",
            parentKindKey: "parent_kind",
            childKey: "child_id",
            orderKey: "position",
            slotKey: "slot",
          },
        },
        scopes: [
          { param: "site_settings", scope: "global" },
          { param: "blocks", scope: "shared" },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const value = result.value as TemplateEditorManifestV2;
    expect(value.groups?.[0]?.id).toBe("advanced");
    expect(value.valueLabels?.style_profiles?.font_size?.["-1"]).toBe("Automatique");
    expect(value.references).toHaveLength(3);
    expect(value.structure?.children?.slotKey).toBe("slot");
    expect(value.scopes).toHaveLength(2);
  });

  it("refuse un groupe avec un champ absent", () => {
    const result = validateTemplateEditorBlock(
      valid({
        groups: [{ param: "style_profiles", id: "colors", label: "Couleurs", fields: ["absent"] }],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.field.includes("groups"))).toBe(true);
  });

  it("refuse une référence vers une collection inconnue", () => {
    const result = validateTemplateEditorBlock(
      valid({
        references: [{ from: "blocks", field: "style_id", to: "absente", targetKey: "id" }],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.field.includes("references"))).toBe(true);
  });

  it("n'interdit pas un cycle de collections sans cycle réel", () => {
    const result = validateTemplateEditorBlock(
      valid({
        references: [
          {
            from: "blocks",
            field: "style_id",
            to: "style_profiles",
            targetKey: "id",
            onDelete: "cascade",
          },
          {
            from: "style_profiles",
            field: "font_size",
            to: "blocks",
            targetKey: "id",
            onDelete: "cascade",
          },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(true);
  });

  it("accepte un cycle de références fonctionnelles non structurelles", () => {
    const result = validateTemplateEditorBlock(
      valid({
        references: [
          { from: "blocks", field: "style_id", to: "style_profiles", targetKey: "id" },
          { from: "style_profiles", field: "font_size", to: "blocks", targetKey: "id" },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(true);
  });

  it("valide visibleWhen sur un objet simple", () => {
    const result = validateTemplateEditorBlock(
      valid({
        fields: [
          {
            param: "site_settings",
            field: "chat_page_id",
            visibleWhen: { field: "chat_mode", equals: "embedded" },
          },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(true);
  });

  it("refuse visibleWhen avec une valeur incompatible", () => {
    const result = validateTemplateEditorBlock(
      valid({
        fields: [
          {
            param: "site_settings",
            field: "chat_page_id",
            visibleWhen: { field: "chat_mode", equals: "absent" },
          },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.field.includes("visibleWhen.equals"))).toBe(true);
  });

  it("refuse un scope inconnu", () => {
    const result = validateTemplateEditorBlock(
      valid({ scopes: [{ param: "blocks", scope: "tenant" }] }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.field.includes("scopes"))).toBe(true);
  });
});

describe("résolution avec valeurs réelles", () => {
  const values: TemplateParamValues = {
    blocks: [
      { id: "hero_main", name: "Hero" },
      { id: "card_one", name: "Carte" },
    ],
  };

  it("retourne l'élément existant", () => {
    const result = validateTemplateEditorBlock(
      valid({
        bindings: [
          {
            param: "blocks",
            itemKey: "id",
            itemId: "hero_main",
            regions: ["block:hero_main"],
            category: "content",
          },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const item = resolveDynamicRegionItem(result.value, "block:hero_main", values);
    expect(item?.index).toBe(0);
    expect(item?.item.name).toBe("Hero");
  });

  it("retourne null si l'élément est absent", () => {
    const result = validateTemplateEditorBlock(valid(), params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    expect(resolveDynamicRegionItem(result.value, "block:missing", values)).toBeNull();
  });

  it("retourne null si l'identifiant est dupliqué", () => {
    const result = validateTemplateEditorBlock(valid(), params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    expect(
      resolveDynamicRegionItem(result.value, "block:hero_main", {
        blocks: [
          { id: "hero_main", name: "Hero" },
          { id: "hero_main", name: "Doublon" },
        ],
      }),
    ).toBeNull();
  });
});

describe("unicité des identifiants de collection", () => {
  it("refuse deux éléments avec le même identifiant", () => {
    const result = validateTemplateEditorBlock(valid(), params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const errors = validateTemplateEditorCollectionValues(result.value, {
      blocks: [
        { id: "hero", name: "Hero" },
        { id: "hero", name: "Doublon" },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("dupliqué");
  });

  it("refuse un identifiant vide", () => {
    const result = validateTemplateEditorBlock(valid(), params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const errors = validateTemplateEditorCollectionValues(result.value, {
      blocks: [{ id: "", name: "Sans identifiant" }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("identifiant stable");
  });
});
