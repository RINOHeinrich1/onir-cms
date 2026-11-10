import { describe, expect, it } from "vitest";
import { validateTemplateManifest } from "@/domain/entities/visual-template";
import { buildTemplateContext } from "@/domain/template-contract";
import {
  mergeTemplateParams,
  normalizeTemplateParamValues,
  orphanParamKeys,
  resolveTemplateParams,
  type TemplateParamSchema,
  validateTemplateParamSchema,
  validateTemplateParamValues,
} from "@/domain/template-params";

const SCHEMA: TemplateParamSchema[] = [
  {
    key: "titre_de_livre",
    label: "Titre du livre",
    description: "Titre affiché sur la couverture de l'album",
    type: "string",
    default: "album",
    maxLength: 60,
  },
];

describe("mergeTemplateParams", () => {
  const oldSchema: TemplateParamSchema[] = [
    { key: "chat_title", label: "Titre", description: "", type: "string", default: "ONIRTECH" },
    { key: "primary_color", label: "Couleur", description: "", type: "color", default: "#023777" },
    {
      key: "ambiance",
      label: "Ambiance",
      description: "",
      type: "select",
      default: "jour",
      options: [{ value: "jour", label: "Jour" }],
    },
    { key: "ancien_param", label: "Ancien", description: "", type: "string", default: "x" },
  ];
  const newSchema: TemplateParamSchema[] = [
    { key: "chat_title", label: "Titre", description: "", type: "string", default: "ONIRTECH" },
    { key: "primary_color", label: "Couleur", description: "", type: "color", default: "#023777" },
    {
      key: "ambiance",
      label: "Ambiance",
      description: "",
      type: "select",
      default: "jour",
      options: [{ value: "nuit", label: "Nuit" }],
    },
    {
      key: "finish_label",
      label: "Terminer",
      description: "",
      type: "string",
      default: "Terminer",
    },
  ];

  it("conserve les clés/types compatibles et ajoute les nouveaux défauts", () => {
    const result = mergeTemplateParams(oldSchema, newSchema, {
      chat_title: "Vinia",
      primary_color: "#123456",
      ambiance: "jour",
      ancien_param: "x",
    });
    expect(result.values.chat_title).toBe("Vinia");
    expect(result.values.primary_color).toBe("#123456");
    expect(result.values.finish_label).toBe("Terminer");
    expect(result.values.ambiance).toBe("jour"); // option absente => défaut
    expect(result.added).toEqual(["finish_label"]);
    expect(result.removed).toContain("ancien_param");
  });

  it("réinitialise si le type change", () => {
    const changed = newSchema.map((param) =>
      param.key === "chat_title" ? { ...param, type: "number" as const, default: 0 } : param,
    );
    const result = mergeTemplateParams(oldSchema, changed, { chat_title: "Vinia" });
    expect(result.values.chat_title).toBe(0);
    expect(result.reset).toContain("chat_title");
  });
});

describe("validateTemplateParamSchema", () => {
  it("accepte un bloc valide et projette les champs connus", () => {
    const result = validateTemplateParamSchema([
      { ...SCHEMA[0], inconnu: "ignoré" },
      {
        key: "niveau",
        label: "Niveau",
        type: "select",
        default: "a",
        options: [{ value: "a", label: "A" }],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]).toEqual(SCHEMA[0]);
  });

  it("exige une valeur par défaut", () => {
    const result = validateTemplateParamSchema([
      { key: "titre_de_livre", label: "Titre", type: "string" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.field).toBe("params[0].default");
  });

  it("refuse les clés dupliquées et les mauvais types", () => {
    const result = validateTemplateParamSchema([
      { key: "a", label: "A", type: "inconnu", default: "x" },
      { key: "a", label: "A", type: "string", default: "x" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.field === "params[0].type")).toBe(true);
    expect(result.errors.some((error) => error.field === "params[1].key")).toBe(true);
  });

  it("exige un défaut parmi les options d'un select", () => {
    const result = validateTemplateParamSchema([
      {
        key: "ambiance",
        label: "Ambiance",
        type: "select",
        default: "nuit",
        options: [{ value: "jour", label: "Jour" }],
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it("valide le type image avec une valeur vide ou une URL", () => {
    expect(
      validateTemplateParamSchema([
        { key: "assistant_logo", label: "Logo", type: "image", default: "" },
      ]).ok,
    ).toBe(true);
    expect(
      validateTemplateParamSchema([
        {
          key: "assistant_logo",
          label: "Logo",
          type: "image",
          default: "https://exemple.test/logo.png",
        },
      ]).ok,
    ).toBe(true);
    expect(
      validateTemplateParamSchema([
        { key: "assistant_logo", label: "Logo", type: "image", default: "pas une url" },
      ]).ok,
    ).toBe(false);
  });

  it("valide color et url", () => {
    expect(
      validateTemplateParamSchema([
        { key: "couleur", label: "Couleur", type: "color", default: "#023777" },
      ]).ok,
    ).toBe(true);
    expect(
      validateTemplateParamSchema([
        { key: "lien", label: "Lien", type: "url", default: "pas une url" },
      ]).ok,
    ).toBe(false);
  });
});

describe("resolveTemplateParams (chargement tolérant)", () => {
  it("applique le défaut quand la valeur est absente ou invalide", () => {
    expect(resolveTemplateParams(SCHEMA, {})).toEqual({ titre_de_livre: "album" });
    expect(resolveTemplateParams(SCHEMA, { titre_de_livre: 42 })).toEqual({
      titre_de_livre: "album",
    });
  });

  it("conserve une valeur valide et ignore les clés inconnues", () => {
    expect(
      resolveTemplateParams(SCHEMA, { titre_de_livre: "Album souvenirs", autre: "x" }),
    ).toEqual({ titre_de_livre: "Album souvenirs" });
  });

  it("tolère un manifeste legacy sans params", () => {
    expect(resolveTemplateParams(undefined, {})).toEqual({});
    expect(resolveTemplateParams(null, { titre_de_livre: "Album souvenirs" })).toEqual({});
  });
});

describe("validateTemplateParamValues (écriture stricte)", () => {
  it("signale une valeur invalide sur une clé connue", () => {
    const errors = validateTemplateParamValues(SCHEMA, { titre_de_livre: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("titre_de_livre");
  });

  it("ne rejette pas les clés orphelines", () => {
    expect(validateTemplateParamValues(SCHEMA, { ancien: "valeur" })).toEqual([]);
  });
});

describe("normalizeTemplateParamValues", () => {
  it("ne garde que les scalaires et conserve les orphelines", () => {
    expect(
      normalizeTemplateParamValues({ a: "x", b: 2, c: true, d: { non: "scalaire" }, e: null }),
    ).toEqual({ a: "x", b: 2, c: true });
  });

  it("identifie les clés non déclarées", () => {
    expect(orphanParamKeys(SCHEMA, { titre_de_livre: "x", ancien: "y" })).toEqual(["ancien"]);
  });
});

describe("manifeste et contrat", () => {
  const base = {
    schemaVersion: 1,
    kind: "template",
    id: "demo",
    name: "Demo",
    version: "1.0.0",
    publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
    compatibility: { hostProtocol: "onirtech.template-host.v1" },
    ui: {
      mode: "web-component",
      entry: "./index.js",
      element: "onirtech-template-demo",
      integrity: "sha256-AAAA",
      shadowDom: "open",
    },
    capabilities: ["messages"],
    network: [],
  };

  it("accepte et projette params, [] par défaut", () => {
    const withParams = validateTemplateManifest({ ...base, params: SCHEMA });
    expect(withParams.ok).toBe(true);
    if (withParams.ok) expect(withParams.value.params).toEqual(SCHEMA);

    const without = validateTemplateManifest(base);
    expect(without.ok).toBe(true);
    if (without.ok) expect(without.value.params).toEqual([]);
  });

  it("refuse un bloc params invalide", () => {
    const result = validateTemplateManifest({
      ...base,
      params: [{ key: "Titre", label: "", type: "string", default: 3 }],
    });
    expect(result.ok).toBe(false);
  });

  it("expose ctx.params gelé", () => {
    const ctx = buildTemplateContext({
      surface: "page",
      link: { type: "standard", label: "" },
      locale: "fr",
      brand: { name: "ONIRTECH", logoUrl: null },
      theme: {},
      capabilities: ["messages"],
      consent: null,
      phase: "identity",
      status: "en_cours",
      messages: [],
      typing: false,
      media: { photos: [], liens: [] },
      modelForm: null,
      params: { titre_de_livre: "Album souvenirs" },
    });
    expect(ctx.params).toEqual({ titre_de_livre: "Album souvenirs" });
    expect(Object.isFrozen(ctx.params)).toBe(true);
  });
});
