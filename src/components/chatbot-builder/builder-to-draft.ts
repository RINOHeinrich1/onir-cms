import type { ChatbotBuilderGeneration } from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import { chatbotConfigDraftFromAi } from "../links/chatbot-config-draft";
import {
  type ChatbotDraftState,
  defaultChatbotDraftState,
  serializeChatbotDraftState,
} from "../links/chatbot-draft-state";

export function builderGenerationToDraftState(
  generation: ChatbotBuilderGeneration,
): ChatbotDraftState {
  const state = defaultChatbotDraftState("");
  const dataSelection = {
    mode: "selected" as const,
    connaissanceIds: [],
    mediaIds: [],
  };
  const config = chatbotConfigDraftFromAi(generation.draft, {
    mission: generation.mission,
    dataSelection,
  });
  const knowledgeEnabled =
    generation.mission !== "collect" && generation.sourceIntent.connaissances;

  return {
    ...state,
    label: generation.draft.label,
    config,
    sources: {
      connaissances: knowledgeEnabled,
      phototheque: false,
      lien: false,
    },
    dataDraft: {
      connaissances: generation.draft.knowledge.map((item, index) => ({
        id: `builder-${index + 1}`,
        titre: item.titre,
        contenu: item.contenu,
      })),
      liens: [],
      photos: [],
    },
  };
}

export function serializeBuilderDraftState(
  generation: ChatbotBuilderGeneration,
): Record<string, unknown> {
  return serializeChatbotDraftState(builderGenerationToDraftState(generation));
}
