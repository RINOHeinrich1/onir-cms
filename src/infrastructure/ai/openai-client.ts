/**
 * Client HTTP OpenAI-compatible multi-fournisseurs (ADR-0029 §5).
 * Un seul point d'envoi ; les différences sont isolées par dialecte.
 */

import type { AiMessage } from "@/application/ports/ai-client";
import type { AiDialect } from "@/domain/entities/ai-provider";

const DEFAULT_MAX_TOKENS = 700;

export type ProviderChatInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  dialect: AiDialect;
  label?: string;
  messages: AiMessage[];
  maxTokens?: number;
};

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function requestBody(
  input: ProviderChatInput,
  maxTokens: number,
  tokenField: "max_tokens" | "max_completion_tokens",
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    [tokenField]: maxTokens,
  };
  // Paramètre non standard : uniquement le dialecte Infomaniak + un modèle Qwen.
  if (input.dialect === "infomaniak" && input.model.toLowerCase().startsWith("qwen/")) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  return body;
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403) return "Clé API fournisseur refusée";
  if (status === 404) return "Modèle ou endpoint introuvable";
  if (status === 429) return "Quota ou débit fournisseur dépassé";
  if (status >= 500) return "Fournisseur IA indisponible";
  return `Service IA indisponible (HTTP ${status})`;
}

async function post(
  input: ProviderChatInput,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(endpoint(input.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
    redirect: "error",
  });
}

/** Exécute une complétion sur un fournisseur OpenAI-compatible. */
export async function chatCompletionForProvider(input: ProviderChatInput): Promise<string> {
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const startedAt = Date.now();

  try {
    let response: Response;
    try {
      response = await post(input, requestBody(input, maxTokens, "max_tokens"), controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Délai d'attente IA dépassé (120 s)");
      }
      throw new Error("Service IA injoignable");
    }

    // OpenAI récent peut refuser `max_tokens` : une seule reprise compatible.
    if (response.status === 400) {
      const detail = await response.text();
      if (/max_tokens|max_completion_tokens/i.test(detail)) {
        try {
          response = await post(
            input,
            requestBody(input, maxTokens, "max_completion_tokens"),
            controller.signal,
          );
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Délai d'attente IA dépassé (120 s)");
          }
          throw new Error("Service IA injoignable");
        }
      }
    }

    if (!response.ok) {
      throw new Error(statusMessage(response.status));
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: {
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    };
    const durationMs = Date.now() - startedAt;
    const reasoningTokens = json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    console.info(
      `[ia] ${input.label ?? "provider"} · ${input.model} · ${durationMs} ms · tokens=${json.usage?.completion_tokens ?? "?"} (raisonnement=${reasoningTokens})`,
    );

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("Réponse IA vide");
    }
    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}
