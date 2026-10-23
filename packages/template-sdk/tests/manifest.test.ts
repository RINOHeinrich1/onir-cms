import { describe, expect, it } from "vitest";
import { TEMPLATE_HOST_PROTOCOL } from "../src/constants.js";
import { defineManifest, type TemplateManifestInput } from "../src/manifest.js";

const INPUT: TemplateManifestInput = {
  id: "aurora",
  name: "Aurora",
  description: "Chat et formulaire clairs.",
  version: "1.0.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: {
    mode: "web-component",
    entry: "./dist/index.js",
    element: "onirtech-template-aurora",
    shadowDom: "open",
  },
  capabilities: ["messages", "theme"],
  params: [
    {
      key: "titre",
      label: "Titre",
      description: "Titre affiché en haut du chat",
      type: "string",
      default: "Discutons de votre projet",
      maxLength: 80,
    },
    {
      key: "ambiance",
      label: "Ambiance",
      type: "select",
      default: "clair",
      options: [
        { value: "clair", label: "Clair" },
        { value: "sombre", label: "Sombre" },
      ],
    },
  ],
};

describe("defineManifest", () => {
  it("injecte les valeurs fixes du contrat", () => {
    const manifest = defineManifest(INPUT);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.kind).toBe("template");
    expect(manifest.compatibility.hostProtocol).toBe(TEMPLATE_HOST_PROTOCOL);
    expect(manifest.network).toEqual([]);
    expect(manifest.ui.shadowDom).toBe("open");
  });

  it("conserve les paramètres déclarés", () => {
    const manifest = defineManifest(INPUT);
    expect(manifest.params).toHaveLength(2);
    expect(manifest.params[0]).toEqual({
      key: "titre",
      label: "Titre",
      description: "Titre affiché en haut du chat",
      type: "string",
      default: "Discutons de votre projet",
      maxLength: 80,
    });
    expect(manifest.params[1]?.options).toHaveLength(2);
  });

  it("retourne un objet gelé en profondeur", () => {
    const manifest = defineManifest(INPUT);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.capabilities)).toBe(true);
    expect(Object.isFrozen(manifest.params)).toBe(true);
    expect(Object.isFrozen(manifest.params[0])).toBe(true);
  });

  it("n'émet pas ui.integrity (calculée au build)", () => {
    const manifest = defineManifest(INPUT);
    expect("integrity" in manifest.ui).toBe(false);
  });

  it("accepte un `network` explicite", () => {
    const manifest = defineManifest({ ...INPUT, network: ["api.onirtech.mg"] });
    expect(manifest.network).toEqual(["api.onirtech.mg"]);
  });
});
