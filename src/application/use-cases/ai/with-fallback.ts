import type { AiClient, AiCompletionInput } from "@/application/ports/ai-client";
import type { AiExtractionClient } from "@/application/ports/ai-client-factory";

/** Client qui essaie les membres d'une chaîne dans l'ordre (ADR-0058). */
export function fallbackAiClient(clients: readonly AiExtractionClient[]): AiClient {
  return {
    async complete(input: AiCompletionInput): Promise<string> {
      let lastError: unknown = null;
      for (const entry of clients) {
        try {
          return await entry.client.complete(input);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Aucun modèle IA disponible");
    },
  };
}
