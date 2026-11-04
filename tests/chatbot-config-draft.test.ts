import { describe, expect, it } from "vitest";
import {
  chatbotConfigPayload,
  defaultChatbotConfigDraft,
  draftFromConfig,
  effectiveSystemPrompt,
} from "@/components/links/chatbot-config-draft";

describe("brouillon de configuration chatbot", () => {
  it("démarre en mode guidé sans fiche sélectionnée", () => {
    const draft = defaultChatbotConfigDraft();
    expect(draft.behaviorMode).toBe("guided");
    expect(draft.fiches).toEqual([]);
    expect(draft.simple.guardrails).toEqual([]);
  });

  it("conserve zéro fiche lors du rechargement d'un brouillon", () => {
    const draft = draftFromConfig({
      systemPrompt: "",
      simple: {},
      fiches: [],
    });
    expect(draft?.fiches).toEqual([]);
  });

  it("convertit l'ancien format de garde-fous texte en liste", () => {
    const draft = draftFromConfig({
      systemPrompt: "Ancien prompt",
      simple: {
        role: "assistant",
        objective: "collecter",
        language: { mode: "auto" },
        tone: "",
        guardrails: "Premier garde-fou\nSecond garde-fou",
        extraInstructions: "",
      },
      fiches: [],
    });
    expect(draft?.simple.guardrails).toEqual(["Premier garde-fou", "Second garde-fou"]);
    expect(draft?.behaviorMode).toBe("guided");
  });

  it("envoie un tableau de garde-fous et le prompt généré en mode guidé", () => {
    const draft = defaultChatbotConfigDraft();
    draft.simple.guardrails = [" Première règle ", "", "Seconde règle"];
    draft.simple.role = "assistant test";
    const payload = chatbotConfigPayload(draft);
    expect(payload.behaviorMode).toBe("guided");
    expect(payload.simple).toMatchObject({
      guardrails: ["Première règle", "Seconde règle"],
    });
    expect(payload.systemPrompt).toBe(effectiveSystemPrompt(draft));
    expect(String(payload.systemPrompt)).toContain("Tu es assistant test.");
  });

  it("expose par défaut la sélection globale complète", () => {
    const draft = defaultChatbotConfigDraft();
    expect(draft.dataSelection).toEqual({ mode: "all", connaissanceIds: [], mediaIds: [] });
    expect(chatbotConfigPayload(draft).dataSelection).toEqual(draft.dataSelection);
  });

  it("recharge et renvoie une sélection personnalisée", () => {
    const draft = draftFromConfig({
      ...chatbotConfigPayload(defaultChatbotConfigDraft()),
      dataSelection: {
        mode: "selected",
        connaissanceIds: ["k1", "k1", " k2 "],
        mediaIds: ["m1"],
      },
    });
    expect(draft?.dataSelection).toEqual({
      mode: "selected",
      connaissanceIds: ["k1", "k2"],
      mediaIds: ["m1"],
    });
    expect(chatbotConfigPayload(draft ?? defaultChatbotConfigDraft()).dataSelection).toEqual(
      draft?.dataSelection,
    );
  });

  it("convertit un select sans options en texte dans le payload", () => {
    const draft = defaultChatbotConfigDraft();
    draft.fiches = [
      {
        id: "f1",
        key: "fiche",
        label: "Fiche",
        description: "",
        intent: "",
        instructions: "",
        renderTemplate: "",
        fields: [
          {
            id: "field-1",
            name: "duree_prevue",
            label: "Durée prévue",
            type: "select",
            required: false,
            options: "",
            unit: "",
            example: "3 à 6 mois",
          },
        ],
      },
    ];
    const payload = chatbotConfigPayload(draft);
    const fiches = payload.fiches as Array<{ fields: Array<{ type: string }> }>;
    expect(fiches[0]?.fields[0]?.type).toBe("text");
  });

  it("en mode expert, conserve le prompt saisi comme source", () => {
    const draft = defaultChatbotConfigDraft();
    draft.behaviorMode = "expert";
    draft.systemPrompt = "  Prompt expert personnalisé  ";
    const payload = chatbotConfigPayload(draft);
    expect(payload.behaviorMode).toBe("expert");
    expect(payload.systemPrompt).toBe("Prompt expert personnalisé");
  });

  it("porte la configuration de l'outil de recherche avec des valeurs sûres par défaut", () => {
    const draft = defaultChatbotConfigDraft();
    expect(draft.searchTool).toEqual({
      ficheTypes: [],
      statusMode: "hidden_fixed",
      fixedStatusKeys: [],
      sortMode: "fair_rotation",
      scope: "chat_link",
    });
    expect(chatbotConfigPayload(draft).searchTool).toEqual(draft.searchTool);
  });

  it("sérialise puis relit searchTool sans perte", () => {
    const draft = defaultChatbotConfigDraft();
    draft.searchTool = {
      ficheTypes: ["fournisseur", "partenaire"],
      statusMode: "hidden_fixed",
      fixedStatusKeys: ["publie"],
      sortMode: "created_at",
      scope: "chat_link",
    };
    const payload = chatbotConfigPayload(draft);
    const reloaded = draftFromConfig(payload);
    expect(reloaded?.searchTool).toEqual(draft.searchTool);
    expect(chatbotConfigPayload(reloaded ?? draft).searchTool).toEqual(draft.searchTool);
  });

  it("tolère une configuration d'outil absente ou invalide en revenant aux défauts", () => {
    const absent = draftFromConfig({ fiches: [] });
    expect(absent?.searchTool.statusMode).toBe("hidden_fixed");
    const invalid = draftFromConfig({ fiches: [], searchTool: { statusMode: "bogus" } });
    expect(invalid?.searchTool).toEqual({
      ficheTypes: [],
      statusMode: "hidden_fixed",
      fixedStatusKeys: [],
      sortMode: "fair_rotation",
      scope: "chat_link",
    });
  });

  it("conserve les statuts de qualification du snapshot de fiche", () => {
    const statuses = [
      {
        key: "publie",
        label: "Publié",
        order: 0,
        isDefault: true,
        archivedAt: null,
        updatedAt: "2026-11-04T12:00:00.000Z",
      },
    ];
    const draft = defaultChatbotConfigDraft();
    draft.fiches = [
      {
        id: "f1",
        key: "fournisseur",
        label: "Fournisseur",
        description: "",
        intent: "",
        instructions: "",
        renderTemplate: "# Fournisseur\n",
        fields: [
          {
            id: "field-1",
            name: "nom",
            label: "Nom",
            type: "text",
            required: true,
            options: "",
            unit: "",
            example: "",
          },
        ],
        statuses,
      },
    ];
    const payload = chatbotConfigPayload(draft);
    const reloaded = draftFromConfig(payload);
    expect(reloaded?.fiches[0]?.statuses).toEqual(statuses);
  });
});
