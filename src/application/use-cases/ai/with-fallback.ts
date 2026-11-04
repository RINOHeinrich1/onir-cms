import type { AiClient, AiCompletionInput, AiToolCompletion } from "@/application/ports/ai-client";
import type { AiExtractionClient } from "@/application/ports/ai-client-factory";

/** Client qui essaie les membres d'une chaîne dans l'ordre (ADR-0058). */
export function fallbackAiClient(clients: readonly AiExtractionClient[]): AiClient {
  const firstCapabilities = clients[0]?.client.capabilities;
  const wrapped: AiClient = {
    ...(firstCapabilities === undefined ? {} : { capabilities: firstCapabilities }),
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
  // Chaîne de secours compatible outils : seuls les clients qui exposent
  // `completeWithTools` sont essayés (les autres ne peuvent pas porter un
  // appel d'outil natif ; le planner JSON reste le chemin de secours).
  wrapped.completeWithTools = async (input): Promise<AiToolCompletion> => {
    let lastError: unknown = null;
    for (const entry of clients) {
      if (entry.client.completeWithTools === undefined) continue;
      try {
        return await entry.client.completeWithTools(input);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Aucun modèle IA compatible avec les outils");
  };
  return wrapped;
}
