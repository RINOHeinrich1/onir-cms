/**
 * Boucle d'outils IA bornée (ADR-0067 §7, §10) et projections.
 *
 * Deux chemins :
 *  - tool calling natif si le fournisseur l'annonce (`supportsToolCalling`) ;
 *  - planner JSON de secours sinon (un seul retry en cas de JSON invalide).
 *
 * Dans les deux cas : **deux appels d'outil maximum**, arguments validés par
 * l'application (P3), et aucune fuite de statut / métadonnée / champ fichier
 * dans la projection modèle.
 */

import type {
  AiClient,
  AiCompletionInput,
  AiMessage,
  AiToolCall,
  AiToolCompletion,
  AiToolDefinition,
} from "@/application/ports/ai-client";
import {
  MAX_TOOL_FIELDS,
  MAX_TOOL_ITEMS,
  type MessageBlock,
  parseToolField,
  TOOL_CONTRACT_VERSION,
  type ToolField,
} from "@/domain/tool-blocks";
import {
  buildPlannerToolCatalog,
  PLANNER_RETRY_SUFFIX,
  PLANNER_SYSTEM_SUFFIX,
  parsePlannerOutput,
} from "@/domain/tool-planner";

export const MAX_TOOL_CALLS = 2;

const EMPTY_FALLBACK = "Je n'ai pas pu obtenir de résultat.";

export type ToolExecutionResult = { tool: string; result: unknown };

export type ToolLoopInput = {
  ai: AiClient;
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  /** Le fournisseur annonce le tool calling natif. */
  supportsToolCalling: boolean;
  tools: AiToolDefinition[];
  /** Exécution validée côté application (registre P3). */
  executeTool: (name: string, args: unknown) => Promise<unknown>;
  /** Borne dure : 2 par défaut. */
  maxToolCalls?: number;
};

export type ToolLoopOutput = {
  content: string;
  blocks: MessageBlock[];
  toolCallCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeFields(value: unknown): ToolField[] {
  if (!Array.isArray(value)) return [];
  const fields: ToolField[] = [];
  for (const entry of value) {
    if (fields.length >= MAX_TOOL_FIELDS) break;
    const field = parseToolField(entry);
    if (field !== null) fields.push(field);
  }
  return fields;
}

/**
 * Projection modèle : uniquement les identifiants/champs utiles au
 * raisonnement. Les clés autorisées sont en allowlist : `statusKey`, les
 * métadonnées et les champs fichier ne peuvent pas fuiter.
 */
export function toModelItems(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result
      .map((entry) => toModelItems(entry))
      .filter((entry) => entry !== null && entry !== undefined);
  }
  if (!isRecord(result)) {
    if (
      typeof result === "string" ||
      typeof result === "number" ||
      typeof result === "boolean" ||
      result === null
    ) {
      return result;
    }
    return null;
  }

  const out: Record<string, unknown> = {};
  if (Array.isArray(result.fields)) {
    out.fields = safeFields(result.fields).map((field) => ({ ...field }));
  }
  for (const key of ["ficheId", "key", "label", "tool"] as const) {
    const value = result[key];
    if (typeof value === "string") out[key] = value;
  }
  if (typeof result.error === "string") out.error = result.error;
  for (const key of ["total", "hasMore"] as const) {
    const value = result[key];
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  if (Array.isArray(result.items)) {
    out.items = result.items
      .slice(0, MAX_TOOL_ITEMS)
      .map((entry) => toModelItems(entry))
      .filter((entry) => entry !== null && entry !== undefined);
  }
  if (isRecord(result.page)) {
    const limit = result.page.limit;
    const offset = result.page.offset;
    if (typeof limit === "number" && typeof offset === "number") {
      out.page = { limit, offset };
    }
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

function resultItems(result: unknown): Array<Record<string, unknown>> {
  if (!isRecord(result)) return [];
  if (Array.isArray(result.items)) return result.items.filter(isRecord);
  // `get_fiche` renvoie directement un item (`{ ficheId, fields }`).
  if (Array.isArray(result.fields)) return [result];
  return [];
}

function resultMeta(result: unknown): { total?: number; hasMore?: boolean } {
  if (!isRecord(result)) return {};
  return {
    ...(typeof result.total === "number" ? { total: result.total } : {}),
    ...(typeof result.hasMore === "boolean" ? { hasMore: result.hasMore } : {}),
  };
}

/** Projection template : blocs `tool_search_result` ou texte de secours. */
export function toTemplateBlocks(tool: string, result: unknown): MessageBlock[] {
  const items = resultItems(result);
  if (items.length > 0) {
    const projected = items
      .slice(0, MAX_TOOL_ITEMS)
      .map((item) => ({ fields: safeFields(item.fields) }))
      .filter((item) => item.fields.length > 0);
    if (projected.length > 0) {
      return [
        {
          type: "tool_search_result",
          contractVersion: TOOL_CONTRACT_VERSION,
          tool,
          layout: "list",
          items: projected,
          meta: resultMeta(result),
        },
      ];
    }
  }

  if (tool === "count_fiches" && isRecord(result) && typeof result.total === "number") {
    return [{ type: "text", text: `${result.total} fiche(s)` }];
  }
  if (tool === "list_fiche_types" && Array.isArray(result)) {
    const labels = result
      .filter(isRecord)
      .map((entry) =>
        typeof entry.label === "string"
          ? entry.label
          : typeof entry.key === "string"
            ? entry.key
            : "",
      )
      .filter((label) => label !== "");
    if (labels.length > 0) {
      return [{ type: "text", text: `Types de fiches : ${labels.join(", ")}` }];
    }
  }
  return [];
}

/** Texte de secours (`content`) quand le modèle ne fournit pas de réponse. */
export function buildToolFallbackText(results: readonly ToolExecutionResult[]): string {
  const parts: string[] = [];
  for (const { tool, result } of results) {
    if (!isRecord(result)) continue;
    if (typeof result.total === "number") {
      parts.push(`${result.total} fiche(s)`);
      continue;
    }
    if (tool === "get_fiche" && Array.isArray(result.fields)) {
      parts.push("Fiche trouvée.");
      continue;
    }
    if (Array.isArray(result.items) && result.items.length > 0) {
      parts.push(`${result.items.length} fiche(s) trouvée(s).`);
    }
  }
  return parts.length > 0 ? parts.join("\n") : EMPTY_FALLBACK;
}

function blocksFor(results: readonly ToolExecutionResult[], content: string): MessageBlock[] {
  const blocks = results.flatMap(({ tool, result }) => toTemplateBlocks(tool, result));
  if (content.trim() !== "") blocks.push({ type: "text", text: content });
  return blocks;
}

/** Parse les arguments JSON d'un appel d'outil ; jamais exécuté si invalides. */
export function parseToolArguments(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: true, value: {} };
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Arguments JSON invalides" };
  }
  if (decoded === null) return { ok: true, value: {} };
  if (!isRecord(decoded)) return { ok: false, error: "Arguments JSON : objet attendu" };
  return { ok: true, value: decoded };
}

async function executeCall(
  input: ToolLoopInput,
  name: string,
  args: unknown,
): Promise<ToolExecutionResult> {
  try {
    return { tool: name, result: await input.executeTool(name, args) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur d'outil";
    return { tool: name, result: { error: message } };
  }
}

async function executeNativeCall(
  input: ToolLoopInput,
  call: AiToolCall,
): Promise<ToolExecutionResult> {
  const parsed = parseToolArguments(call.arguments);
  if (!parsed.ok) return { tool: call.name, result: { error: parsed.error } };
  return executeCall(input, call.name, parsed.value);
}

function toolRequest(input: ToolLoopInput, messages: AiMessage[]): AiCompletionInput {
  return {
    system: input.system,
    messages,
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    tools: input.tools,
    toolChoice: "auto",
  };
}

function callWithTools(input: ToolLoopInput, messages: AiMessage[]): Promise<AiToolCompletion> {
  if (input.ai.completeWithTools === undefined) {
    return Promise.reject(new Error("Client IA sans tool calling natif"));
  }
  return input.ai.completeWithTools(toolRequest(input, messages));
}

async function plainAnswer(
  input: ToolLoopInput,
  messages: AiMessage[],
  results: readonly ToolExecutionResult[],
): Promise<string> {
  try {
    const answer = await input.ai.complete({
      system: input.system,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "Réponds maintenant sans appeler d'outil, en te fondant sur les résultats fournis.",
        },
      ],
      ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    });
    return answer.trim() !== "" ? answer.trim() : buildToolFallbackText(results);
  } catch {
    return buildToolFallbackText(results);
  }
}

async function runNative(input: ToolLoopInput, maxToolCalls: number): Promise<ToolLoopOutput> {
  let messages = [...input.messages];
  const results: ToolExecutionResult[] = [];
  let toolCallCount = 0;
  let completion = await callWithTools(input, messages);

  while (toolCallCount < maxToolCalls && completion.toolCalls.length > 0) {
    const calls = completion.toolCalls.slice(0, maxToolCalls - toolCallCount);
    messages = [...messages, { role: "assistant", content: completion.content, toolCalls: calls }];
    for (const call of calls) {
      toolCallCount += 1;
      const execution = await executeNativeCall(input, call);
      results.push(execution);
      messages = [
        ...messages,
        {
          role: "tool",
          content: JSON.stringify(toModelItems(execution.result)) ?? "null",
          toolCallId: call.id,
        },
      ];
    }
    if (toolCallCount >= maxToolCalls) break;
    completion = await callWithTools(input, messages);
  }

  let content = completion.content.trim();
  if (completion.toolCalls.length > 0 || content === "") {
    content = await plainAnswer(input, messages, results);
  }
  return { content, blocks: blocksFor(results, content), toolCallCount };
}

async function runPlanner(input: ToolLoopInput, maxToolCalls: number): Promise<ToolLoopOutput> {
  let messages = [...input.messages];
  const results: ToolExecutionResult[] = [];
  let toolCallCount = 0;
  const system = `${input.system}\n\n${PLANNER_SYSTEM_SUFFIX}\n\n${buildPlannerToolCatalog(input.tools)}`;

  while (toolCallCount < maxToolCalls) {
    const raw = await input.ai.complete({
      system,
      messages,
      ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
      structured: true,
    });
    let parsed = parsePlannerOutput(raw);
    if (parsed === null) {
      const retry = await input.ai.complete({
        system: `${system}\n\n${PLANNER_RETRY_SUFFIX}`,
        messages,
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        structured: true,
      });
      parsed = parsePlannerOutput(retry);
      if (parsed === null) {
        const content = await plainAnswer(input, messages, results);
        return { content, blocks: blocksFor(results, content), toolCallCount };
      }
    }

    if (parsed.action === "final") {
      return {
        content: parsed.text,
        blocks: blocksFor(results, parsed.text),
        toolCallCount,
      };
    }

    toolCallCount += 1;
    const execution = await executeCall(input, parsed.action, parsed.arguments);
    results.push(execution);
    messages = [
      ...messages,
      {
        role: "user",
        content: `Résultat de l'outil ${parsed.action} : ${JSON.stringify(
          toModelItems(execution.result),
        )}`,
      },
    ];
  }

  const content = await plainAnswer(input, messages, results);
  return { content, blocks: blocksFor(results, content), toolCallCount };
}

/**
 * Exécute la boucle bornée : tool calling natif si annoncé, sinon planner JSON.
 * `content` est toujours non vide (texte de secours si nécessaire).
 */
export async function runToolLoop(input: ToolLoopInput): Promise<ToolLoopOutput> {
  const maxToolCalls = Math.max(1, Math.min(input.maxToolCalls ?? MAX_TOOL_CALLS, MAX_TOOL_CALLS));
  const native =
    input.supportsToolCalling && input.tools.length > 0 && input.ai.completeWithTools !== undefined;
  return native ? runNative(input, maxToolCalls) : runPlanner(input, maxToolCalls);
}

const FILTER_PROPERTIES = {
  query: { type: "string", description: "Recherche plein texte (facultative)." },
  ficheTypes: {
    type: "array",
    items: { type: "string" },
    description: "Types de fiches à interroger (sous-ensemble autorisé).",
  },
  conditions: {
    type: "array",
    description: "Conditions typées sur les champs de la fiche.",
    items: {
      type: "object",
      properties: {
        field: { type: "string" },
        operator: { type: "string" },
        value: {},
      },
      required: ["field", "operator"],
      additionalProperties: false,
    },
  },
  createdFrom: { type: "string", description: "Date de création minimale (AAAA-MM-JJ)." },
  createdTo: { type: "string", description: "Date de création maximale (AAAA-MM-JJ)." },
} as const;

/**
 * Définitions OpenAI `function` des cinq outils internes en lecture seule.
 * Les arguments restent validés par le registre P3 avant exécution.
 */
export const FICHE_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: "search_fiches",
    description: "Recherche des fiches internes rattachées au chatbot et renvoie des champs typés.",
    parameters: {
      type: "object",
      properties: {
        ...FILTER_PROPERTIES,
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "continue_search",
    description: "Continue la recherche active en affichant la page suivante.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_fiche",
    description: "Relit une fiche précise par son identifiant interne.",
    parameters: {
      type: "object",
      properties: { ficheId: { type: "string" } },
      required: ["ficheId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_fiche_types",
    description: "Liste les types de fiches interrogeables pour ce chatbot.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "count_fiches",
    description: "Compte les fiches correspondant à des critères, sans pagination.",
    parameters: {
      type: "object",
      properties: { ...FILTER_PROPERTIES },
      additionalProperties: false,
    },
  },
];
