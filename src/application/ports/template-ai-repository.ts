import type { ChatTemplateVersion, TemplateDefinition } from "@/domain/entities/chat-template";

export type AiKnowledgeInput = {
  titre: string;
  contenu: string;
};

export type KnowledgeMergePolicy = "append" | "replace";

export type ApplyTemplateAiInput = {
  organizationId: string;
  /** null = création ; sinon nouvelle version du modèle existant. */
  templateKey: string | null;
  definition: TemplateDefinition;
  knowledge: AiKnowledgeInput[];
  mergePolicy: KnowledgeMergePolicy;
  generationId: string;
  createdBy: string | null;
};

export type ApplyTemplateAiResult = {
  version: ChatTemplateVersion;
  knowledge: {
    created: number;
    replaced: number;
    skipped: number;
    conflicts: string[];
  };
};

/** Écriture atomique de la version du modèle et de ses connaissances IA. */
export interface TemplateAiRepository {
  apply(input: ApplyTemplateAiInput): Promise<ApplyTemplateAiResult>;
}
