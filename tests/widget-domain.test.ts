import { describe, expect, it } from "vitest";
import { buildWidgetSnippet } from "@/application/use-cases/links/widget-code";
import { validateTemplateManifest } from "@/domain/entities/visual-template";
import { parseTemplateAction } from "@/domain/template-contract";
import {
  DEFAULT_WIDGET_DISPLAY,
  parseChatLinkWidgetConfig,
  resolveWidgetPosition,
} from "@/domain/widget";

describe("surface widget — domaine", () => {
  it("résout la position autorisée ou retombe sur le défaut", () => {
    expect(resolveWidgetPosition(DEFAULT_WIDGET_DISPLAY, { position: "bottom-left" })).toBe(
      "bottom-left",
    );
    expect(
      resolveWidgetPosition(
        { ...DEFAULT_WIDGET_DISPLAY, allowedPositions: ["bottom-right"] },
        { position: "bottom-left" },
      ),
    ).toBe("bottom-right");
  });

  it("ignore une config widget invalide", () => {
    expect(parseChatLinkWidgetConfig(null)).toEqual({});
    expect(parseChatLinkWidgetConfig({ position: "centre" })).toEqual({});
    expect(parseChatLinkWidgetConfig({ position: "top-left" })).toEqual({
      position: "top-left",
    });
  });

  it("génère un snippet avec token et position, sans template", () => {
    const snippet = buildWidgetSnippet("lk_test", "bottom-left");
    expect(snippet).toContain("widget/v1.js");
    expect(snippet).toContain('data-onir-token="lk_test"');
    expect(snippet).toContain('data-onir-position="bottom-left"');
    expect(snippet).not.toContain("template");
  });

  it("valide les actions openWidget/closeWidget", () => {
    expect(
      parseTemplateAction({ action: "openWidget", payload: { width: 400, height: 640 } }).ok,
    ).toBe(true);
    expect(parseTemplateAction({ action: "openWidget", payload: { width: 10 } }).ok).toBe(false);
    expect(parseTemplateAction({ action: "closeWidget" }).ok).toBe(true);
  });
});

describe("manifest widget", () => {
  function manifest(uiWidget: unknown, capabilities: string[] = ["messages"]) {
    return {
      schemaVersion: 1,
      kind: "template",
      id: "aurora",
      name: "Aurora",
      version: "1.0.0",
      publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
      compatibility: { hostProtocol: "onirtech.template-host.v1" },
      ui: {
        mode: "web-component",
        entry: "./index.js",
        element: "onirtech-template-aurora",
        integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        shadowDom: "open",
        widget: uiWidget,
      },
      capabilities,
      network: [],
    };
  }

  const validWidget = {
    entry: "./widget.js",
    element: "onirtech-widget-aurora",
    integrity: "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    display: {
      defaultPosition: "bottom-right",
      allowedPositions: ["bottom-right", "bottom-left"],
      closedSize: { width: 64, height: 64 },
      openSize: { width: 420, height: 680 },
      maxSize: { width: 520, height: 760 },
    },
  };

  it("accepte une surface widget complète", () => {
    const result = validateTemplateManifest(manifest(validWidget));
    expect(result.ok).toBe(true);
  });

  it("refuse ui.widget sans la capacité messages", () => {
    const result = validateTemplateManifest(manifest(validWidget, ["theme"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.field === "ui.widget")).toBe(true);
    }
  });

  it("refuse une position par défaut absente des positions autorisées", () => {
    const result = validateTemplateManifest(
      manifest({
        ...validWidget,
        display: { ...validWidget.display, allowedPositions: ["top-left"] },
      }),
    );
    expect(result.ok).toBe(false);
  });
});
