import { describe, expect, it } from "vitest";
import type { VisualTemplateOption } from "@/components/links/types";
import { defaultStarterSelection } from "@/components/links/visual-template-selection";

const template = (id: string, key: string, versions: string[]): VisualTemplateOption => ({
  id,
  key,
  name: key,
  versions: versions.map((version) => ({
    version,
    params: [
      {
        key: "primary_color",
        label: "Couleur principale",
        description: "",
        type: "color",
        default: "#000000",
      },
    ],
    widget: null,
  })),
});

describe("sélection manuelle par défaut", () => {
  it("présélectionne la dernière version de Starter", () => {
    expect(
      defaultStarterSelection([
        template("tpl-starter", "starter", ["1.9.0", "1.10.0", "1.2.0"]),
        template("tpl-other", "immersive", ["3.0.0"]),
      ]),
    ).toEqual({ visualTemplate: "tpl-starter@1.10.0", params: { primary_color: "#000000" } });
  });

  it("reste sur Défaut si Starter n’est pas installé", () => {
    expect(defaultStarterSelection([template("tpl-other", "immersive", ["3.0.0"])])).toBeNull();
  });
});
