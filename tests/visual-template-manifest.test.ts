import { describe, expect, it } from "vitest";
import {
  isSafeRelativePath,
  mimeByExtension,
  validateTemplateManifest,
} from "@/domain/entities/visual-template";

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "template",
    id: "aurora",
    name: "Aurora",
    description: "Chat clair",
    version: "1.0.0",
    publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
    compatibility: { hostProtocol: "onirtech.template-host.v1" },
    ui: {
      mode: "web-component",
      entry: "./index.js",
      element: "onirtech-template-aurora",
      integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      shadowDom: "open",
    },
    capabilities: ["messages", "media"],
    network: [],
    ...overrides,
  };
}

describe("validateTemplateManifest — norme v1", () => {
  it("accepte un manifeste valide et normalise l'entry", () => {
    const result = validateTemplateManifest(manifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ui.entry).toBe("index.js");
      expect(result.value.publisher.trustLevel).toBe("official");
    }
  });

  it("refuse schemaVersion/kind/hostProtocol invalides", () => {
    expect(validateTemplateManifest(manifest({ schemaVersion: 2 })).ok).toBe(false);
    expect(validateTemplateManifest(manifest({ kind: "package" })).ok).toBe(false);
    expect(
      validateTemplateManifest(manifest({ compatibility: { hostProtocol: "autre.v1" } })).ok,
    ).toBe(false);
  });

  it("refuse un id non kebab-case et une version non SemVer", () => {
    expect(validateTemplateManifest(manifest({ id: "Aurora_1" })).ok).toBe(false);
    expect(validateTemplateManifest(manifest({ version: "1.0" })).ok).toBe(false);
  });

  it("respecte le trust gating : community ⇒ pas de web-component", () => {
    const result = validateTemplateManifest(
      manifest({ publisher: { id: "dev", name: "Dev", trustLevel: "community" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.field === "ui.mode")).toBe(true);
    }
  });

  it("refuse une capacité inconnue et un entry non sûr", () => {
    expect(validateTemplateManifest(manifest({ capabilities: ["messages", "hack"] })).ok).toBe(
      false,
    );
    expect(
      validateTemplateManifest(
        manifest({
          ui: {
            ...(manifest().ui as Record<string, unknown>),
            entry: "../evil.js",
          } as unknown as object,
        }),
      ).ok,
    ).toBe(false);
  });

  it("accepte la capacité data avec ses contrats (ADR-0026)", () => {
    const result = validateTemplateManifest(
      manifest({
        capabilities: ["messages", "data"],
        data: {
          contracts: [
            {
              key: "library",
              label: "Bibliothèque",
              description: "Livres",
              version: 1,
              schema: {
                type: "object",
                required: ["books"],
                properties: {
                  books: { type: "array", items: { type: "string", maxLength: 20 } },
                },
              },
            },
          ],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dataContracts).toHaveLength(1);
      expect(result.value.dataContracts[0]?.loading).toBe("lazy");
      expect(result.value.dataContracts[0]?.schema.additionalProperties).toBe(false);
    }
  });

  it("refuse la capacité data sans bloc, et un bloc sans capacité", () => {
    const withoutBlock = validateTemplateManifest(manifest({ capabilities: ["data"] }));
    expect(withoutBlock.ok).toBe(false);
    if (!withoutBlock.ok) {
      expect(withoutBlock.errors.some((error) => error.field === "data")).toBe(true);
    }

    const withoutCapability = validateTemplateManifest(
      manifest({
        data: {
          contracts: [
            { key: "library", label: "L", version: 1, schema: { type: "object", properties: {} } },
          ],
        },
      }),
    );
    expect(withoutCapability.ok).toBe(false);
    if (!withoutCapability.ok) {
      expect(withoutCapability.errors.some((error) => error.field === "data")).toBe(true);
    }
  });

  it("refuse un contrat de données invalide", () => {
    const result = validateTemplateManifest(
      manifest({
        capabilities: ["data"],
        data: { contracts: [{ key: "Library", label: "L", version: 0, schema: { type: "wat" } }] },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.field.startsWith("data.contracts[0]"))).toBe(true);
    }
  });

  it("refuse une intégrité non SRI", () => {
    const ui = { ...(manifest().ui as Record<string, unknown>), integrity: "deadbeef" };
    expect(validateTemplateManifest(manifest({ ui })).ok).toBe(false);
  });
});

describe("isSafeRelativePath / mimeByExtension", () => {
  it("rejette les chemins dangereux", () => {
    expect(isSafeRelativePath("index.js")).toBe(true);
    expect(isSafeRelativePath("assets/logo.png")).toBe(true);
    expect(isSafeRelativePath("../x")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("a\\b")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
  });

  it("déduit le MIME par extension", () => {
    expect(mimeByExtension("index.js")).toBe("text/javascript");
    expect(mimeByExtension("style.css")).toBe("text/css");
    expect(mimeByExtension("logo.png")).toBe("image/png");
    expect(mimeByExtension("data.bin")).toBe("application/octet-stream");
  });
});
