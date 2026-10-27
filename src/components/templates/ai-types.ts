import type { TemplateField } from "@/domain/entities/chat-template";
import type { TemplateLanguagePolicy } from "@/domain/template-settings";

export type TemplateAiKnowledgeDto = {
  titre: string;
  contenu: string;
};

export type TemplateAiDraftDto = {
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
  knowledge: TemplateAiKnowledgeDto[];
  warnings: string[];
};

export type TemplateAiGenerationDto = {
  generationId: string;
  key: string;
  draft: TemplateAiDraftDto;
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

export type TemplateAiModelsDto = {
  providers: Array<{
    id: string;
    label: string;
    models: Array<{ modelId: string; label: string }>;
  }>;
  defaultProviderId: string | null;
  defaultModel: string | null;
};
