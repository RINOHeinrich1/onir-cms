import { describe, expect, it } from "vitest";
import {
  ficheToDefinition,
  normalizeFicheData,
} from "@/application/use-cases/chat/chatbot-config-runtime";
import { buildFicheDetectionPrompt } from "@/application/use-cases/chat/fiche-instances";
import type { ChatbotConfig, FicheDefinition } from "@/domain/entities/chatbot-config";
import { validateTemplateData } from "@/domain/validate-template-data";

const ITEM: FicheDefinition = {
  key: "item",
  label: "Élément",
  description: "",
  intent: "",
  fields: [
    { name: "nom", label: "Nom", type: "text", required: true },
    { name: "quantite", label: "Quantité", type: "number", required: true },
  ],
  renderTemplate: "# Élément",
  instructions: "",
};

const ROOT: FicheDefinition = {
  key: "racine",
  label: "Racine",
  description: "",
  intent: "",
  fields: [
    { name: "contact", label: "Contact", type: "text", required: true },
    {
      name: "elements",
      label: "Éléments",
      type: "tableau_de_fiches",
      required: true,
      ficheKey: "item",
    },
  ],
  subFiches: [ITEM],
  renderTemplate: "# Racine",
  instructions: "",
};

const CONFIG = {
  id: "cfg",
  organizationId: "org",
  chatLinkId: "link",
  version: 1,
  behaviorMode: "guided",
  collectionMode: "ai",
  systemPrompt: "",
  simple: {
    role: "assistant",
    objective: "",
    language: { mode: "auto" },
    tone: "",
    guardrails: [],
    extraInstructions: "",
  },
  fiches: [ROOT],
  dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
  createdBy: null,
  createdAt: new Date(0).toISOString(),
} as ChatbotConfig;

describe("composition générique de fiches", () => {
  it("conserve un tableau d'objets imbriqué et les nombres", () => {
    const data = normalizeFicheData(ROOT, {
      contact: "034",
      elements: [
        { nom: "chocolat", quantite: 5 },
        { nom: "eau", quantite: 2 },
      ],
    });
    expect(data).toEqual({
      contact: "034",
      elements: [
        { nom: "chocolat", quantite: 5 },
        { nom: "eau", quantite: 2 },
      ],
    });
  });

  it("valide récursivement les champs d'une sous-fiche", () => {
    const definition = ficheToDefinition(CONFIG, ROOT);
    const valid = validateTemplateData(definition, {
      contact: "034",
      elements: [{ nom: "chocolat", quantite: 5 }],
    });
    expect(valid.ok).toBe(true);
    const invalid = validateTemplateData(definition, {
      contact: "034",
      elements: [{ nom: "chocolat" }],
    });
    expect(invalid.ok).toBe(false);
  });

  it("décrit le schéma enfant dans le prompt de détection", () => {
    const prompt = buildFicheDetectionPrompt(CONFIG);
    expect(prompt).toContain('ficheKey "racine"');
    expect(prompt).toContain("tableau_de_fiches");
    expect(prompt).toContain('ficheKey "item"');
    expect(prompt).toContain("Ne crée jamais d'instance racine pour une sous-fiche");
  });
});
