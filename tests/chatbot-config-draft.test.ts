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

  it("en mode expert, conserve le prompt saisi comme source", () => {
    const draft = defaultChatbotConfigDraft();
    draft.behaviorMode = "expert";
    draft.systemPrompt = "  Prompt expert personnalisé  ";
    const payload = chatbotConfigPayload(draft);
    expect(payload.behaviorMode).toBe("expert");
    expect(payload.systemPrompt).toBe("Prompt expert personnalisé");
  });
});
