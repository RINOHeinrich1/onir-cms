import { AppError, BadGatewayError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import { extractAiJsonObject } from "@/domain/chatbot-ai-draft";

/** Budgets génériques pour les modèles qui consomment des tokens en raisonnement. */
export const AI_STRUCTURED_TOKEN_BUDGETS = [4_000, 8_000, 12_000] as const;

function isRetryableMessage(message: string): boolean {
  return /réponse ia vide|json|finish_reason|length|unexpected end/i.test(message);
}

/**
 * Appel JSON commun aux deux passes IA :
 * structured=true dès la première tentative, puis 4k → 8k → 12k.
 */
export async function callStructuredAi(
  client: AiClient,
  input: { system: string; user: string },
): Promise<Record<string, unknown>> {
  let lastError: unknown = null;
  for (const maxTokens of AI_STRUCTURED_TOKEN_BUDGETS) {
    let raw: string;
    try {
      raw = await client.complete({
        system: input.system,
        messages: [{ role: "user", content: input.user }],
        maxTokens,
        structured: true,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message : "";
      if (!isRetryableMessage(message)) {
        throw new BadGatewayError(message === "" ? "La génération IA a échoué" : message);
      }
      lastError = error;
      continue;
    }

    const candidate = extractAiJsonObject(raw);
    if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }
    lastError = new BadGatewayError("L'IA n'a pas renvoyé un JSON exploitable. Réessayez.");
  }

  throw new BadGatewayError(
    lastError instanceof Error
      ? `${lastError.message} (budget de raisonnement insuffisant après plusieurs tentatives)`
      : "L'IA n'a pas renvoyé un JSON exploitable après plusieurs tentatives.",
  );
}
