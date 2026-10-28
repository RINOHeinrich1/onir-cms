import type { AiClient, AiTokenUsage } from "@/application/ports/ai-client";

export type RecordAiUsage = (operation: string, usage: AiTokenUsage) => void | Promise<void>;

/**
 * Enveloppe un client IA pour remonter l'usage tokens au chatbot (ADR-0048).
 * Une panne d'audit ne doit jamais casser une réponse déjà générée.
 */
export function withAiUsage(client: AiClient, record: RecordAiUsage, operation: string): AiClient {
  return {
    async complete(input) {
      return client.complete({
        ...input,
        onUsage: async (usage) => {
          try {
            await record(operation, usage);
          } catch (error) {
            console.error("[ia] usage tokens non enregistré", error);
          }
          await input.onUsage?.(usage);
        },
      });
    },
  };
}
