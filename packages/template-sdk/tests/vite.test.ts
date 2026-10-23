import { describe, expect, it } from "vitest";
import { defineTemplateConfig } from "../src/vite/define-template-config.js";
import { buildManifestJson, computeSri } from "../src/vite/manifest.js";
import type { TemplateConfigOptions } from "../src/vite/options.js";
import { DEFAULT_OUT_DIR, INLINE_LIMIT } from "../src/vite/options.js";

const ELEMENT = "onirtech-template-aurora";

function makeConfig(overrides: Partial<TemplateConfigOptions> = {}) {
  return defineTemplateConfig({ entry: "src/index.ts", element: ELEMENT, ...overrides });
}

/** Manifeste minimal tel que produit par `defineManifest`. */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "template",
    id: "aurora",
    name: "Aurora",
    description: "",
    version: "1.0.0",
    publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
    compatibility: { hostProtocol: "onirtech.template-host.v1" },
    ui: { mode: "iframe", entry: "./src/index.js", element: ELEMENT, shadowDom: "open" },
    capabilities: ["messages"],
    ...overrides,
  };
}

describe("computeSri", () => {
  it("calcule une intégrité SRI sha256-<base64>", () => {
    // sha256("hello") en base64.
    expect(computeSri(Buffer.from("hello", "utf8"))).toBe(
      "sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=",
    );
  });

  it("produit des intégrités différentes pour des bundles différents", () => {
    expect(computeSri(Buffer.from("a"))).not.toBe(computeSri(Buffer.from("b")));
  });
});

describe("buildManifestJson", () => {
  const options = {
    element: ELEMENT,
    entry: "./dist/index.js",
    integrity: "sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=",
  };

  it("injecte entry/integrity et force le mode web-component", () => {
    const parsed = JSON.parse(buildManifestJson(manifest(), options)) as Record<string, unknown>;

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.kind).toBe("template");
    expect(parsed.compatibility).toEqual({ hostProtocol: "onirtech.template-host.v1" });
    expect(parsed.network).toEqual([]);
    expect(parsed.ui).toEqual({
      mode: "web-component",
      entry: "./dist/index.js",
      element: ELEMENT,
      shadowDom: "open",
      integrity: options.integrity,
    });
    // Les champs du manifeste source sont conservés.
    expect(parsed.id).toBe("aurora");
    expect(parsed.publisher).toEqual({ id: "onirtech", name: "ONIRTECH", trustLevel: "official" });
    expect(parsed.capabilities).toEqual(["messages"]);
  });

  it("complète les champs de contrat absents (manifeste partiel)", () => {
    const parsed = JSON.parse(buildManifestJson({ ui: { element: ELEMENT } }, options)) as Record<
      string,
      unknown
    >;

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.kind).toBe("template");
    expect(parsed.compatibility).toEqual({ hostProtocol: "onirtech.template-host.v1" });
    expect(parsed.network).toEqual([]);
  });

  it("conserve un `network` explicite", () => {
    const parsed = JSON.parse(
      buildManifestJson(manifest({ network: ["api.onirtech.mg"] }), options),
    ) as Record<string, unknown>;

    expect(parsed.network).toEqual(["api.onirtech.mg"]);
  });

  it("échoue si ui.element diverge de l'option element", () => {
    expect(() =>
      buildManifestJson(manifest(), { ...options, element: "onirtech-template-autre" }),
    ).toThrow(/ui\.element/);
  });

  it("échoue si le manifeste n'est pas un objet", () => {
    expect(() => buildManifestJson(null, options)).toThrow(/defineManifest/);
  });
});

describe("defineTemplateConfig", () => {
  it("impose les réglages de build de l'ADR §9.1", () => {
    const config = makeConfig();
    const build = config.build;
    expect(build).toBeDefined();

    const lib = build?.lib as {
      entry: string;
      formats?: string[];
      fileName?: (format: string, entryName: string) => string;
    };
    expect(lib.entry).toBe("src/index.ts");
    expect(lib.formats).toEqual(["es"]);
    expect(typeof lib.fileName).toBe("function");
    expect(lib.fileName?.("es", "index")).toBe("index.js");

    expect(build?.cssCodeSplit).toBe(false);
    expect(build?.assetsInlineLimit).toBe(INLINE_LIMIT);
    expect(build?.target).toBe("es2022");
    expect(build?.minify).toBe(true);
    expect(build?.emptyOutDir).toBe(true);
    expect(build?.outDir).toBe(DEFAULT_OUT_DIR);
  });

  it("remplace process.env.NODE_ENV pour le navigateur", () => {
    const config = makeConfig();
    expect(config.define?.["process.env.NODE_ENV"]).toBe(
      JSON.stringify(process.env.NODE_ENV ?? "production"),
    );
  });

  it("force l'inlining des imports dynamiques (bundle unique)", () => {
    const config = makeConfig();
    const output = config.build?.rollupOptions?.output as
      | { inlineDynamicImports?: boolean }
      | undefined;

    expect(output?.inlineDynamicImports).toBe(true);
  });

  it("respecte minify=false et outDir personnalisé", () => {
    const config = makeConfig({ minify: false, outDir: "build" });

    expect(config.build?.minify).toBe(false);
    expect(config.build?.outDir).toBe("build");
  });

  it("ajoute le plugin d'émission du manifeste en dernier", () => {
    const plugins = (makeConfig().plugins ?? []) as Array<{ name?: string }>;

    expect(plugins.map((plugin) => plugin.name)).toEqual(["onirtech-template-manifest"]);
  });

  it("transmet les plugins du projet (React/Vue) de façon additive", () => {
    const reactPlugin = { name: "@vitejs/plugin-react-fixture" };
    const plugins = (makeConfig({ plugins: [reactPlugin] }).plugins ?? []) as Array<{
      name?: string;
    }>;

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      "@vitejs/plugin-react-fixture",
      "onirtech-template-manifest",
    ]);
  });
});
