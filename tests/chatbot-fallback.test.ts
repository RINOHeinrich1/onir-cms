import { describe, expect, it } from "vitest";
import {
  chatbotConfigPayload,
  defaultChatbotConfigDraft,
  draftFromConfig,
} from "@/components/links/chatbot-config-draft";
import {
  defaultChatbotFallback,
  MAX_FALLBACK_QUESTIONS,
  parseChatbotConfig,
  parseChatbotFallback,
} from "@/domain/entities/chatbot-config";

describe("fallback heuristique du chatbot (ADR-0059)", () => {
  it("désactive le fallback par défaut et autorise la fiche existante", () => {
    expect(defaultChatbotFallback()).toMatchObject({
      enabled: false,
      questions: [],
      showCollectionForm: true,
    });
  });

  it("normalise un menu de questions/réponses fermées", () => {
    const parsed = parseChatbotFallback({
      enabled: true,
      intro: "  Choisissez une option.  ",
      questions: [
        { id: "tarifs", label: "  Quels sont vos tarifs ? ", answer: "  Nos tarifs... " },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      enabled: true,
      intro: "Choisissez une option.",
      showCollectionForm: true,
    });
    expect(parsed.value.questions).toEqual([
      { id: "tarifs", label: "Quels sont vos tarifs ?", answer: "Nos tarifs..." },
    ]);
  });

  it("refuse les doublons et les réponses vides", () => {
    const duplicate = parseChatbotFallback({
      questions: [
        { id: "tarifs", label: "Tarifs", answer: "A" },
        { id: "tarifs", label: "Tarifs 2", answer: "B" },
      ],
    });
    expect(duplicate.ok).toBe(false);

    const empty = parseChatbotFallback({
      questions: [{ id: "tarifs", label: "Tarifs", answer: "   " }],
    });
    expect(empty.ok).toBe(false);
  });

  it("borne le nombre de questions", () => {
    const questions = Array.from({ length: MAX_FALLBACK_QUESTIONS + 1 }, (_, index) => ({
      id: `question-${index + 1}`,
      label: "Question",
      answer: "Réponse",
    }));
    expect(parseChatbotFallback({ questions }).ok).toBe(false);
  });

  it("inclut le fallback dans le snapshot de configuration", () => {
    const parsed = parseChatbotConfig({
      behaviorMode: "guided",
      simple: {
        role: "assistant",
        objective: "collecter",
        language: { mode: "auto" },
        tone: "",
        guardrails: [],
        extraInstructions: "",
      },
      fiches: [],
      fallback: {
        enabled: true,
        questions: [{ id: "tarifs", label: "Tarifs", answer: "Réponse" }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fallback?.enabled).toBe(true);
    expect(parsed.value.fallback?.questions).toHaveLength(1);
  });

  it("conserve le fallback dans le brouillon et le payload", () => {
    const draft = defaultChatbotConfigDraft();
    draft.fallback = {
      enabled: true,
      intro: "Introduction",
      questions: [{ id: "tarifs", label: "Tarifs", answer: "Réponse" }],
      showCollectionForm: false,
    };
    const payload = chatbotConfigPayload(draft);
    expect(payload.fallback).toEqual(draft.fallback);
    expect(draftFromConfig(payload)?.fallback).toEqual(draft.fallback);
  });
});
