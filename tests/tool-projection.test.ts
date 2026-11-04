import { describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { MAX_TOOL_FIELD_TEXT } from "@/domain/tool-blocks";
import { projectFichesToToolItems, projectFicheToToolFields } from "@/domain/tool-projection";

const DEFINITION: TemplateDefinition = {
  key: "maison",
  label: "Maison",
  description: "",
  systemPrompt: "x",
  fields: [
    { name: "titre", label: "Titre", type: "text", required: true },
    { name: "loyer", label: "Loyer", type: "number", required: true, unit: "€" },
    { name: "disponible", label: "Disponible", type: "date", required: false },
    { name: "photo", label: "Photo", type: "image", required: false },
    { name: "site", label: "Site", type: "url", required: false },
    { name: "equipements", label: "Équipements", type: "multi", required: false },
    { name: "cin", label: "CIN", type: "file", required: false },
  ],
  renderTemplate: "",
};

describe("projectFicheToToolFields", () => {
  it("projette dans l'ordre de la définition, avec unité et valeurs typées", () => {
    const fields = projectFicheToToolFields(DEFINITION, {
      titre: "Maison A",
      loyer: 0,
      disponible: "2026-01-01",
      photo: "https://exemple.mg/a.jpg",
      site: "https://exemple.mg",
      equipements: ["eau", "électricité"],
      cin: "secret.pdf",
    });
    expect(fields.map((field) => field.key)).toEqual([
      "titre",
      "loyer",
      "disponible",
      "photo",
      "site",
      "equipements",
    ]);
    expect(fields[1]).toEqual({
      key: "loyer",
      label: "Loyer",
      type: "number",
      value: 0,
      unit: "€",
    });
    expect(fields[5]?.value).toEqual(["eau", "électricité"]);
  });

  it("omet les champs vides et exclut les fichiers", () => {
    const fields = projectFicheToToolFields(DEFINITION, { titre: "Maison", cin: "secret.pdf" });
    expect(fields).toEqual([{ key: "titre", label: "Titre", type: "text", value: "Maison" }]);
  });

  it("tronque les textes longs", () => {
    const fields = projectFicheToToolFields(DEFINITION, {
      titre: "a".repeat(MAX_TOOL_FIELD_TEXT + 10),
    });
    expect(fields[0]?.type).toBe("text");
    expect(String(fields[0]?.value)).toHaveLength(MAX_TOOL_FIELD_TEXT + 1);
  });
});

describe("projectFichesToToolItems", () => {
  it("ignore les fiches sans définition et conserve l'ordre", () => {
    const items = projectFichesToToolItems([
      { definition: null, data: { titre: "A" } },
      { definition: DEFINITION, data: { titre: "B" } },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.fields[0]?.value).toBe("B");
  });
});
