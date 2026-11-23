import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateTemplateManifest } from "@/domain/entities/visual-template";
import {
  bindingsForRegion,
  editorRegionChain,
  isTemplateEditorBindingShared,
  type TemplateEditorManifest,
  validateTemplateEditorBlock,
} from "@/domain/template-editor";
import type { TemplateParamSchema } from "@/domain/template-params";

const params: TemplateParamSchema[] = [
  {
    key: "chat_title",
    label: "Titre",
    description: "",
    type: "string",
    default: "Assistant",
  },
  {
    key: "primary_color",
    label: "Couleur",
    description: "",
    type: "color",
    default: "#000000",
  },
  {
    key: "welcome_title",
    label: "Bienvenue",
    description: "",
    type: "string",
    default: "Bienvenue",
  },
  {
    key: "sections",
    label: "Sections",
    description: "",
    type: "object",
    default: { show_hero: true },
    properties: [
      {
        key: "show_hero",
        label: "Afficher",
        description: "",
        type: "boolean",
        default: true,
      },
    ],
  },
];

function editor(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    regions: [
      { id: "header", label: "En-tête" },
      { id: "welcome", label: "Bienvenue", parent: "header" },
      { id: "hero", label: "Hero", visibilityParam: "sections.show_hero" },
    ],
    bindings: [
      { param: "chat_title", regions: ["header"], category: "content" },
      { param: "primary_color", regions: ["header", "welcome"], category: "appearance" },
      { param: "welcome_title", regions: ["welcome"], category: "content" },
    ],
    ...overrides,
  };
}

describe("contrat editor (ADR-0105)", () => {
  it("accepte un bloc valide et déduit les paramètres partagés", () => {
    const result = validateTemplateEditorBlock(editor(), params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;

    expect(result.value.regions).toHaveLength(3);
    expect(bindingsForRegion(result.value, "header")).toHaveLength(2);
    expect(
      result.value.bindings.filter(isTemplateEditorBindingShared).map((binding) => binding.param),
    ).toEqual(["primary_color"]);
    expect(editorRegionChain(result.value, "welcome").map((region) => region.id)).toEqual([
      "header",
      "welcome",
    ]);
  });

  it("refuse un binding vers un paramètre inconnu", () => {
    const result = validateTemplateEditorBlock(
      editor({
        bindings: [{ param: "inconnu", regions: ["header"], category: "content" }],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.message === "paramètre inexistant")).toBe(true);
  });

  it("refuse un paramètre de visibilité non booléen", () => {
    const result = validateTemplateEditorBlock(
      editor({
        regions: [
          { id: "header", label: "En-tête", visibilityParam: "chat_title" },
          { id: "hero", label: "Hero" },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.message === "booléen attendu")).toBe(true);
  });

  it("refuse une région dupliquée et un parent inconnu", () => {
    const result = validateTemplateEditorBlock(
      editor({
        regions: [
          { id: "header", label: "En-tête", parent: "absent" },
          { id: "header", label: "Doublon" },
        ],
      }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.message.includes("dupliqué"))).toBe(true);
    expect(result.errors.some((error) => error.message.includes("parent inconnu"))).toBe(true);
  });

  it("valide le manifeste Starter 1.7.0 avec ses zones", () => {
    const manifest = JSON.parse(
      readFileSync("template-kit/template/onirtech.template.json", "utf8"),
    ) as unknown;
    const result = validateTemplateManifest(manifest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const editor = result.value.editor as TemplateEditorManifest | undefined;
    expect(editor).toBeDefined();
    expect(editor?.regions.map((region) => region.id)).toContain("header");
    expect(editor?.bindings.some((binding) => binding.param === "primary_color")).toBe(true);
  });
});
