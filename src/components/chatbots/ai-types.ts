import type { TemplateField } from "@/domain/entities/chat-template";
import type { ChatbotFallback } from "@/domain/entities/chatbot-config";
import type { TemplateLanguagePolicy, TemplateSimpleSettings } from "@/domain/template-settings";

export type ChatbotAiKnowledgeDto = {
  id?: string;
  titre: string;
  contenu: string;
  source?: { type: "page"; url: string } | { type: "document"; filename: string };
};

export type ChatbotAiDraftDto = {
  label: string;
  description: string;
  role: string;
  objective: string;
  language: TemplateLanguagePolicy;
  tone: string;
  guardrails: string[];
  extraInstructions: string;
  fields: TemplateField[];
  systemPrompt: string;
  renderTemplate: string;
  knowledge: ChatbotAiKnowledgeDto[];
  fallback: ChatbotFallback;
  settings: TemplateSimpleSettings;
  warnings: string[];
};

export type ChatbotAiGenerationDto = {
  generationId: string;
  key: string;
  draft: ChatbotAiDraftDto;
  sources: {
    pages: Array<{ url: string; title: string; chars: number }>;
    files: Array<{ name: string; chars: number; warnings: string[] }>;
    chars: number;
    truncated: boolean;
  };
  warnings: string[];
  existingAiKnowledgeCount: number;
  providerLabel: string;
  model: string;
};

export type ChatbotAiModelsDto = {
  providers: Array<{
    id: string;
    label: string;
    models: Array<{ modelId: string; label: string }>;
  }>;
  defaultProviderId: string | null;
  defaultModel: string | null;
};
