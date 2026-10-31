import { describe, expect, it } from "vitest";
import {
  chatbotConfigDraftFromAi,
  chatbotConfigPayload,
  defaultChatbotConfigDraft,
  draftFromConfig,
  effectiveSystemPrompt,
} from "@/components/links/chatbot-config-draft";
import { parseTemplateAiDraft } from "@/domain/template-ai-draft";

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

  it("convertit un brouillon IA en configuration éditable avec fiche et fallback", () => {
    const parsed = parseTemplateAiDraft(
      {
        label: "Assistant projet",
        description: "Qualifier un projet",
        role: "conseiller",
        objective: "Comprendre le besoin",
        fields: [
          { label: "Projet", type: "textarea", required: true },
          { label: "Budget", type: "text", required: false },
        ],
        knowledge: [],
        fallback: {
          enabled: true,
          questions: [{ id: "services", label: "Quels services ?", answer: "Réponse factuelle" }],
        },
      },
      { key: "assistant-projet" },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const draft = chatbotConfigDraftFromAi(parsed.value);
    expect(draft.behaviorMode).toBe("guided");
    expect(draft.fiches).toHaveLength(1);
    expect(draft.fiches[0]?.fields).toHaveLength(2);
    expect(draft.fallback.questions).toHaveLength(1);
    expect(draft.fallback.showCollectionForm).toBe(true);
  });

  it("en mode expert, conserve le prompt saisi comme source", () => {
    const draft = defaultChatbotConfigDraft();
    draft.behaviorMode = "expert";
    draft.systemPrompt = "  Prompt expert personnalisé  ";
    const payload = chatbotConfigPayload(draft);
    expect(payload.behaviorMode).toBe("expert");
    expect(payload.systemPrompt).toBe("Prompt expert personnalisé");
  });
});
