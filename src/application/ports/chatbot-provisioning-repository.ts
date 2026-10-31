import type { ChatbotConfigInput } from "@/domain/entities/chatbot-config";
import type { CreateChatLinkInput } from "./chat-link-repository";

export type ProvisioningKnowledgeInput = {
  titre: string;
  contenu: string;
};

export type ProvisionChatbotInput = {
  organizationId: string;
  link: CreateChatLinkInput;
  config: ChatbotConfigInput;
  knowledge: ProvisioningKnowledgeInput[];
  createdBy: string | null;
};

export type ProvisionChatbotResult = {
  linkId: string;
  knowledge: {
    created: number;
    skipped: string[];
  };
};

/**
 * Création atomique d'un chatbot : lien + canaux + configuration + connaissances
 * dans une seule transaction. Les connaissances restent un domaine indépendant
 * et l'API `/api/connaissances` n'est pas modifiée.
 */
export interface ChatbotProvisioningRepository {
  create(input: ProvisionChatbotInput): Promise<ProvisionChatbotResult>;
}
