import { describe, expect, it } from "vitest";
import { buildCollecteState } from "@/application/use-cases/chat/collecte-state";
import type { TemplateField } from "@/domain/entities/chat-template";

const FIELDS: TemplateField[] = [
  { name: "type_partenariat", label: "Type de partenariat", type: "text", required: true },
  { name: "message", label: "Votre intention", type: "textarea", required: true },
  {
    name: "email",
    label: "Email",
    type: "email",
    required: false,
  },
];

describe("état de collecte — libellés utilisateur", () => {
  it("liste les champs manquants sans nom technique", () => {
    const state = buildCollecteState(FIELDS, {});
    expect(state).toContain("Type de partenariat, Votre intention");
    expect(state).not.toContain("[type_partenariat]");
    expect(state).not.toContain("[message]");
  });

  it("ne produit rien quand tous les champs obligatoires sont présents", () => {
    expect(
      buildCollecteState(FIELDS, {
        type_partenariat: "partenaire stratégique",
        message: "apporter son soutien",
      }),
    ).toBe("");
  });
});
