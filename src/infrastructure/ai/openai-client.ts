/**
 * Client HTTP OpenAI-compatible multi-fournisseurs (ADR-0029 §5).
 * Un seul point d'envoi ; les différences sont isolées par dialecte.
 */

import type {
  AiMessage,
  AiTokenUsage,
  AiToolCall,
  AiToolCompletion,
  AiToolDefinition,
} from "@/application/ports/ai-client";
import {
  type AiCapabilities,
  aiCapabilitiesFor,
  type ReasoningMode,
} from "@/domain/ai-capabilities";
import type { AiDialect } from "@/domain/entities/ai-provider";
import { ProviderHttpError, retryAfterFromHeaders } from "./provider-http-error";

const DEFAULT_MAX_TOKENS = 700;

export type ProviderChatInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  dialect: AiDialect;
  label?: string;
  messages: AiMessage[];
  maxTokens?: number;
  reasoning?: ReasoningMode | undefined;
  structured?: boolean | undefined;
  /** Outils proposés au modèle (tool calling natif, ADR-0067 §7.1). */
  tools?: AiToolDefinition[] | undefined;
  toolChoice?: "auto" | "none" | undefined;
  capabilities?: AiCapabilities | undefined;
  onUsage?: ((usage: AiTokenUsage) => void | Promise<void>) | undefined;
  onFinishReason?: ((reason: string | null) => void) | undefined;
};

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

/**
 * Traduit les messages du port vers le format OpenAI. Les champs `toolCalls`
 * et `toolCallId` ne sont émis que lorsqu'ils sont présents : le chemin sans
 * outil reste strictement identique (`{ role, content }`).
 */
function wireMessages(messages: AiMessage[]): Record<string, unknown>[] {
  return messages.map((message) => {
    const wire: Record<string, unknown> = { role: message.role, content: message.content };
    if (message.role === "tool" && message.toolCallId !== undefined) {
      wire.tool_call_id = message.toolCallId;
    }
    if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
      wire.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      }));
    }
    return wire;
  });
}

function requestBody(
  input: ProviderChatInput,
  maxTokens: number,
  tokenField: "max_tokens" | "max_completion_tokens",
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: wireMessages(input.messages),
    [tokenField]: maxTokens,
  };
  const reasoning = input.reasoning ?? "auto";
  const capabilities =
    input.capabilities ??
    (input.dialect === "infomaniak" ? aiCapabilitiesFor("infomaniak", input.model) : undefined);
  const control = capabilities?.reasoningControl ?? "none";

  // Paramètre non standard vLLM/Infomaniak. Gemma et Qwen sont connus pour
  // boucler en raisonnement sur les prompts d'extraction : on les désactive
  // par défaut en mode auto.
  if (control === "infomaniak_chat_template") {
    const model = input.model.toLowerCase();
    const thinkingByDefault = model.startsWith("qwen/") || model.startsWith("google/gemma");
    if (reasoning === "enabled") {
      body.chat_template_kwargs = { enable_thinking: true };
    } else if (reasoning === "disabled" || (reasoning === "auto" && thinkingByDefault)) {
      body.chat_template_kwargs = { enable_thinking: false };
    }
  } else if (control === "openai_reasoning_effort" && reasoning !== "auto") {
    body.reasoning_effort = reasoning === "disabled" ? "minimal" : "high";
  } else if (control === "openrouter_reasoning" && reasoning !== "auto") {
    body.reasoning = { effort: reasoning === "disabled" ? "low" : "high", exclude: true };
  }

  if (input.structured === true && capabilities?.structuredOutput === "json_object") {
    body.response_format = { type: "json_object" };
  }

  // Tool calling natif : uniquement si des outils sont fournis. Le chemin
  // existant (sans `tools`) n'envoie donc aucun paramètre supplémentaire.
  if (input.tools !== undefined && input.tools.length > 0) {
    body.tools = input.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = input.toolChoice ?? "auto";
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

type CompletionJson = {
  choices?: Array<{
    message?: { content?: unknown; tool_calls?: unknown };
    finish_reason?: unknown;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

/**
 * Envoie la requête et gère la reprise OpenAI (`max_tokens` refusé) une seule
 * fois. Commun aux chemins avec et sans outils.
 */
async function postWithRetry(
  input: ProviderChatInput,
  maxTokens: number,
  controller: AbortController,
): Promise<{ json: CompletionJson; durationMs: number }> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await post(input, requestBody(input, maxTokens, "max_tokens"), controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Délai d'attente IA dépassé (120 s)");
    }
    throw new ProviderHttpError(0, "Service IA injoignable");
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
        throw new ProviderHttpError(0, "Service IA injoignable");
      }
    }
  }

  if (!response.ok) {
    throw new ProviderHttpError(
      response.status,
      statusMessage(response.status),
      retryAfterFromHeaders(response.headers),
    );
  }

  const json = (await response.json()) as CompletionJson;
  return { json, durationMs: Date.now() - startedAt };
}

async function reportUsage(
  input: ProviderChatInput,
  json: CompletionJson,
  completionText: string,
): Promise<{ completionTokens: number }> {
  const promptText = input.messages.map((message) => message.content).join("\n");
  const promptTokens =
    json.usage?.prompt_tokens ?? (promptText === "" ? 0 : Math.ceil(promptText.length / 4));
  const completionTokens =
    json.usage?.completion_tokens ??
    (completionText === "" ? 0 : Math.ceil(completionText.length / 4));
  const totalTokens = json.usage?.total_tokens ?? promptTokens + completionTokens;
  await input.onUsage?.({ promptTokens, completionTokens, totalTokens });
  return { completionTokens };
}

function finishReasonOf(json: CompletionJson): string | null {
  const value = json.choices?.[0]?.finish_reason;
  return typeof value === "string" ? value : null;
}

/** Normalise un `tool_calls` fournisseur (arguments parfois objet). */
function parseToolCalls(value: unknown): AiToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: AiToolCall[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const fn = record.function;
    if (fn === null || typeof fn !== "object") continue;
    const fnRecord = fn as Record<string, unknown>;
    const name = typeof fnRecord.name === "string" ? fnRecord.name.trim() : "";
    if (name === "") continue;
    const rawArguments = fnRecord.arguments;
    const args =
      typeof rawArguments === "string"
        ? rawArguments
        : rawArguments === undefined || rawArguments === null
          ? "{}"
          : JSON.stringify(rawArguments);
    calls.push({
      id: typeof record.id === "string" ? record.id : `call_${calls.length}`,
      name,
      arguments: args,
    });
  }
  return calls;
}

/** Exécute une complétion sur un fournisseur OpenAI-compatible. */
export async function chatCompletionForProvider(input: ProviderChatInput): Promise<string> {
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const { json, durationMs } = await postWithRetry(input, maxTokens, controller);
    const finishReason = finishReasonOf(json);
    input.onFinishReason?.(finishReason);
    const content = json.choices?.[0]?.message?.content;
    const completionText = typeof content === "string" ? content : "";
    const { completionTokens } = await reportUsage(input, json, completionText);
    const reasoningTokens = json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    console.info(
      `[ia] ${input.label ?? "provider"} · ${input.model} · ${durationMs} ms · tokens=${completionTokens} (raisonnement=${reasoningTokens})`,
    );

    if (completionText.trim() === "") {
      throw new Error("Réponse IA vide");
    }
    return completionText.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Complétion avec tool calling natif (ADR-0067 §7.1). Retourne le contenu
 * (éventuellement vide) ET les appels d'outil normalisés. Une réponse vide
 * est acceptée dès qu'au moins un appel d'outil est présent.
 */
export async function chatCompletionWithToolsForProvider(
  input: ProviderChatInput,
): Promise<AiToolCompletion> {
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const { json, durationMs } = await postWithRetry(input, maxTokens, controller);
    const finishReason = finishReasonOf(json);
    input.onFinishReason?.(finishReason);
    const content = json.choices?.[0]?.message?.content;
    const completionText = typeof content === "string" ? content : "";
    const toolCalls = parseToolCalls(json.choices?.[0]?.message?.tool_calls);
    const { completionTokens } = await reportUsage(input, json, completionText);
    const reasoningTokens = json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    console.info(
      `[ia] ${input.label ?? "provider"} · ${input.model} · ${durationMs} ms · tokens=${completionTokens} (raisonnement=${reasoningTokens}, outils=${toolCalls.length})`,
    );

    if (completionText.trim() === "" && toolCalls.length === 0) {
      throw new Error("Réponse IA vide");
    }
    return {
      content: completionText.trim(),
      toolCalls,
      finishReason,
    };
  } finally {
    clearTimeout(timeout);
  }
}
