import { describe, expect, it } from "vitest";
import { resolveActionMenuPlacement } from "@/components/links/action-menu-placement";

describe("resolveActionMenuPlacement", () => {
  it("ouvre vers le bas quand la place est suffisante", () => {
    expect(
      resolveActionMenuPlacement({
        top: 300,
        bottom: 340,
        panelHeight: 300,
        viewportHeight: 800,
      }),
    ).toEqual({ placement: "bottom", maxHeight: 300 });
  });

  it("bascule vers le haut quand le bas du viewport est trop proche", () => {
    expect(
      resolveActionMenuPlacement({
        top: 700,
        bottom: 740,
        panelHeight: 300,
        viewportHeight: 800,
      }),
    ).toEqual({ placement: "top", maxHeight: 300 });
  });

  it("limite la hauteur au plus grand espace disponible", () => {
    expect(
      resolveActionMenuPlacement({
        top: 500,
        bottom: 540,
        panelHeight: 500,
        viewportHeight: 800,
      }),
    ).toEqual({ placement: "top", maxHeight: 488 });
  });

  it("garde le bas quand les deux espaces sont insuffisants", () => {
    expect(
      resolveActionMenuPlacement({
        top: 100,
        bottom: 140,
        panelHeight: 500,
        viewportHeight: 600,
      }),
    ).toEqual({ placement: "bottom", maxHeight: 448 });
  });

  it("respecte la marge de sécurité", () => {
    expect(
      resolveActionMenuPlacement({
        top: 50,
        bottom: 100,
        panelHeight: 400,
        viewportHeight: 500,
        margin: 20,
      }),
    ).toEqual({ placement: "bottom", maxHeight: 380 });
  });
});
