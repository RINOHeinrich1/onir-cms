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
    shadowDom: "open",
    widget: null,
    disabled: false,
    healthStatus: "unknown",
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

  it("ignore les versions désactivées ou en erreur", () => {
    const starter = template("tpl-starter", "starter", ["1.9.0", "1.10.0"]);
    const versions = starter.versions;
    if (versions[1] !== undefined) {
      versions[1].disabled = true;
    }
    if (versions[0] !== undefined) {
      versions[0].healthStatus = "error";
    }
    expect(defaultStarterSelection([starter])).toBeNull();
  });
});
