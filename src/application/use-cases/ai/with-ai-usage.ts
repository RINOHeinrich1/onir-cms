import type {
  AiClient,
  AiCompletionInput,
  AiTokenUsage,
  AiToolCompletion,
} from "@/application/ports/ai-client";

export type RecordAiUsage = (operation: string, usage: AiTokenUsage) => void | Promise<void>;

function usageCallback(input: AiCompletionInput, record: RecordAiUsage, operation: string) {
  return async (usage: AiTokenUsage): Promise<void> => {
    try {
      await record(operation, usage);
    } catch (error) {
      console.error("[ia] usage tokens non enregistré", error);
    }
    await input.onUsage?.(usage);
  };
}

/**
 * Enveloppe un client IA pour remonter l'usage tokens au chatbot (ADR-0048).
 * Une panne d'audit ne doit jamais casser une réponse déjà générée. Les appels
 * d'outil (`completeWithTools`) sont instrumentés de la même façon.
 */
export function withAiUsage(client: AiClient, record: RecordAiUsage, operation: string): AiClient {
  const wrapped: AiClient = {
    ...(client.capabilities === undefined ? {} : { capabilities: client.capabilities }),
    async complete(input) {
      return client.complete({
        ...input,
        usageOperation: operation,
        onUsage: usageCallback(input, record, operation),
      });
    },
  };
  if (client.completeWithTools !== undefined) {
    wrapped.completeWithTools = async (input): Promise<AiToolCompletion> =>
      client.completeWithTools?.({
        ...input,
        usageOperation: operation,
        onUsage: usageCallback(input, record, operation),
      }) ?? { content: "", toolCalls: [], finishReason: null };
  }
  return wrapped;
}
