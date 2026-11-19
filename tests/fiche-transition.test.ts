import { describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { evaluateFicheTransitions } from "@/domain/fiche-transition";

const definition: TemplateDefinition = {
  key: "commande",
  label: "Commande",
  description: "",
  systemPrompt: "",
  renderTemplate: "",
  fields: [
    { name: "nom", label: "Nom", type: "text", required: true },
    { name: "telephone", label: "Téléphone", type: "text", required: false },
    {
      name: "societe",
      label: "Société",
      type: "text",
      required: false,
      requiredIf: { field: "nom", equals: "Pro" },
    },
  ],
};

const requested = {
  allFields: true,
  requiredFields: true,
  fields: ["nom", "telephone", "societe"],
};

describe("evaluateFicheTransitions", () => {
  it("ne réémet rien quand l'état n'a pas changé", () => {
    const state = { data: { nom: "Camille" }, status: "active" as const };
    expect(evaluateFicheTransitions(definition, state, state, requested)).toEqual([]);
  });

  it("émet field_filled sur vide → rempli", () => {
    const events = evaluateFicheTransitions(
      definition,
      { data: { nom: "Camille" }, status: "active" },
      { data: { nom: "Camille", telephone: "034" }, status: "active" },
      requested,
    );
    expect(events).toContainEqual({
      eventType: "fiche.draft.field_filled",
      fieldKey: "telephone",
    });
  });

  it("émet required_fields_filled quand les obligations sont satisfaites", () => {
    const events = evaluateFicheTransitions(
      definition,
      { data: { nom: "" }, status: "active" },
      { data: { nom: "Camille" }, status: "active" },
      requested,
    );
    expect(events.map((event) => event.eventType)).toContain("fiche.draft.required_fields_filled");
  });

  it("émet all_fields_filled seulement quand tous les champs sont remplis", () => {
    const events = evaluateFicheTransitions(
      definition,
      { data: { nom: "Camille" }, status: "active" },
      { data: { nom: "Camille", telephone: "034", societe: "ONIR" }, status: "active" },
      requested,
    );
    expect(events.map((event) => event.eventType)).toContain("fiche.draft.all_fields_filled");
  });

  it("n'émet rien pour une instance abandonnée", () => {
    const events = evaluateFicheTransitions(
      definition,
      { data: {}, status: "active" },
      { data: { nom: "Camille" }, status: "abandoned" },
      requested,
    );
    expect(events).toEqual([]);
  });
});
