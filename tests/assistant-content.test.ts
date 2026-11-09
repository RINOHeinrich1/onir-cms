import { describe, expect, it } from "vitest";
import {
  fieldLabelsFromFields,
  sanitizeAssistantBlocks,
  sanitizeAssistantContent,
  sanitizeAssistantHistory,
} from "@/domain/assistant-content";
import type { TemplateField } from "@/domain/entities/chat-template";

const FIELDS: TemplateField[] = [
  { name: "type_partenariat", label: "Type de partenariat", type: "multi", required: true },
  { name: "message", label: "Votre intention", type: "textarea", required: true },
];

describe("contenu assistant — noms techniques", () => {
  it("construit le mapping nom technique → libellé", () => {
    expect(fieldLabelsFromFields(FIELDS)).toEqual({
      type_partenariat: "Type de partenariat",
      message: "Votre intention",
    });
  });

  it("remplace un libellé suivi du nom technique", () => {
    expect(
      sanitizeAssistantContent(
        "Type de partenariat [type_partenariat] : partenaire stratégique",
        fieldLabelsFromFields(FIELDS),
      ),
    ).toBe("Type de partenariat : partenaire stratégique");
  });

  it("remplace un nom technique isolé sans toucher aux autres crochets", () => {
    expect(
      sanitizeAssistantContent(
        "[message] : apporter son soutien\nRéférence [externe] conservée",
        fieldLabelsFromFields(FIELDS),
      ),
    ).toBe("Votre intention : apporter son soutien\nRéférence [externe] conservée");
  });

  it("ne nettoie que les messages assistant de l’historique", () => {
    const history = sanitizeAssistantHistory(
      [
        { role: "user", content: "Type de partenariat [type_partenariat]" },
        { role: "assistant", content: "Type de partenariat [type_partenariat]" },
      ],
      fieldLabelsFromFields(FIELDS),
    );
    expect(history[0]?.content).toContain("[type_partenariat]");
    expect(history[1]?.content).toBe("Type de partenariat");
  });

  it("nettoie les blocs texte sans toucher aux blocs d’outils", () => {
    const blocks = sanitizeAssistantBlocks(
      [
        { type: "text", text: "Votre intention [message]" },
        {
          type: "image",
          url: "https://exemple.test/image.png",
          alt: "Image",
        },
      ],
      fieldLabelsFromFields(FIELDS),
    );
    expect(blocks[0]).toEqual({ type: "text", text: "Votre intention" });
    expect(blocks[1]).toEqual({
      type: "image",
      url: "https://exemple.test/image.png",
      alt: "Image",
    });
  });
});
