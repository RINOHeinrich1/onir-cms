/** Brouillon persistant de création de chatbot (wizard). */
export type ChatbotDraft = {
  id: string;
  organizationId: string;
  createdBy: string | null;
  label: string;
  /** État sérialisé du wizard (jamais interprété par l'infrastructure). */
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateChatbotDraftInput = {
  label: string;
  state: Record<string, unknown>;
  createdBy: string | null;
};

export type UpdateChatbotDraftInput = {
  label?: string;
  state?: Record<string, unknown>;
};

export interface ChatbotDraftRepository {
  list(organizationId: string): Promise<ChatbotDraft[]>;
  findById(organizationId: string, id: string): Promise<ChatbotDraft | null>;
  create(organizationId: string, input: CreateChatbotDraftInput): Promise<ChatbotDraft>;
  update(
    organizationId: string,
    id: string,
    input: UpdateChatbotDraftInput,
  ): Promise<ChatbotDraft | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
}
