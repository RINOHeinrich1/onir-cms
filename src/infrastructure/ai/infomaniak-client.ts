/**
 * Client HTTP de l'API Infomaniak OpenAI-compatible (B028) — RM-IA-001.
 * Appels strictement côté serveur : le token ne quitte jamais le backend.
 *
 * Latence : les modèles Qwen 3.5 raisonnent par défaut (chaîne de pensée
 * incluse dans `completion_tokens`), ce qui multipliait le temps de réponse
 * (plusieurs dizaines de secondes). On désactive explicitement le mode
 * « thinking » pour les modèles Qwen et on plafonne les tokens générés.
 */

import type { AiMessage } from "@/application/ports/ai-client";
import { infomaniakBaseUrl } from "@/infrastructure/ai/models";
import { aiConfig } from "@/lib/env";

/** Borne par défaut des tokens générés (latence prévisible). */
const DEFAULT_MAX_TOKENS = 700;

/** Vrai si le modèle est un Qwen (seul famille où l'on coupe le raisonnement). */
function supportsNoThinking(model: string): boolean {
  return model.startsWith("Qwen/");
}

export async function chatCompletion(input: {
  model: string;
  messages: AiMessage[];
  maxTokens?: number;
}): Promise<string> {
  const config = aiConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;

  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    max_tokens: maxTokens,
  };
  if (supportsNoThinking(input.model)) {
    // Coupe la chaîne de pensée : réponse directe, latence divisée.
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${infomaniakBaseUrl(config.productId)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Délai d'attente IA dépassé (120 s)");
    }
    throw new Error("Service IA injoignable");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Service IA indisponible (HTTP ${response.status})`);
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
    `[ia] ${input.model} · ${durationMs} ms · tokens=${json.usage?.completion_tokens ?? "?"} (raisonnement=${reasoningTokens})`,
  );

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Réponse IA vide");
  }
  return content.trim();
}
