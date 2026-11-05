import { describe, expect, it, vi } from "vitest";
import type { AiClient, AiCompletionInput, AiToolCompletion } from "@/application/ports/ai-client";
import {
  parseToolArguments,
  runToolLoop,
  toModelItems,
  toTemplateBlocks,
} from "@/application/use-cases/chat/tool-loop";

const TOOLS = [
  {
    name: "search_fiches",
    description: "Recherche des fiches.",
    parameters: { type: "object", properties: {} },
  },
];

const FIELDS = [
  { key: "titre", label: "Titre", type: "text" as const, value: "Maison A" },
  { key: "loyer", label: "Loyer", type: "number" as const, value: 1200, unit: "€" },
];

const SEARCH_RESULT = {
  items: [
    {
      ficheId: "f1",
      fields: FIELDS,
      statusKey: "publie",
    },
  ],
  total: 1,
  hasMore: false,
  page: { limit: 10, offset: 0 },
};

function toolCompletion(overrides: Partial<AiToolCompletion> = {}): AiToolCompletion {
  return { content: "", toolCalls: [], finishReason: "stop", ...overrides };
}

function client(overrides: Partial<AiClient> = {}): AiClient {
  return {
    complete: vi.fn(async () => "Réponse par défaut"),
    ...overrides,
  };
}

describe("runToolLoop — tool calling natif", () => {
  it("exécute un outil, renvoie le résultat au modèle et produit des blocs", async () => {
    const executeTool = vi.fn(async () => SEARCH_RESULT);
    const completeWithTools = vi
      .fn<(input: AiCompletionInput) => Promise<AiToolCompletion>>()
      .mockResolvedValueOnce(
        toolCompletion({
          toolCalls: [
            {
              id: "call_1",
              name: "search_fiches",
              arguments: '{"ficheTypes":["maison"]}',
            },
          ],
          finishReason: "tool_calls",
        }),
      )
      .mockResolvedValueOnce(toolCompletion({ content: "J'ai trouvé une maison." }));
    const ai = client({
      completeWithTools,
      capabilities: {
        reasoningControl: "none",
        supportsReasoningToggle: false,
        structuredOutput: "prompt",
        supportsToolCalling: true,
      },
    });

    const output = await runToolLoop({
      ai,
      system: "Système",
      messages: [{ role: "user", content: "Cherche une maison" }],
      supportsToolCalling: true,
      tools: TOOLS,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith("search_fiches", { ficheTypes: ["maison"] });
    expect(output.toolCallCount).toBe(1);
    expect(output.content).toBe("J'ai trouvé une maison.");
    expect(output.blocks[0]).toMatchObject({
      type: "tool_search_result",
      contractVersion: 1,
      tool: "search_fiches",
    });
    expect(output.blocks.at(-1)).toEqual({ type: "text", text: "J'ai trouvé une maison." });

    // Le message `tool` envoyé au modèle ne contient ni statut ni champ fichier.
    const secondCall = completeWithTools.mock.calls[1]?.[0];
    const toolMessage = secondCall?.messages.at(-1);
    expect(toolMessage?.role).toBe("tool");
    expect(String(toolMessage?.content)).not.toContain("statusKey");
    expect(String(toolMessage?.content)).not.toContain("publie");
  });

  it("borne la boucle à deux appels d'outil puis répond sans outil", async () => {
    const executeTool = vi.fn(async () => ({ total: 2 }));
    const completeWithTools = vi.fn(async () =>
      toolCompletion({
        toolCalls: [{ id: "c", name: "count_fiches", arguments: "{}" }],
        finishReason: "tool_calls",
      }),
    );
    const complete = vi.fn(async () => "Réponse finale sans outil");
    const ai = client({ completeWithTools, complete });

    const output = await runToolLoop({
      ai,
      system: "Système",
      messages: [],
      supportsToolCalling: true,
      tools: TOOLS,
      executeTool,
      maxToolCalls: 10,
    });

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(output.toolCallCount).toBe(2);
    expect(output.content).toBe("Réponse finale sans outil");
  });

  it("n'exécute pas un outil quand ses arguments JSON sont invalides", async () => {
    const executeTool = vi.fn(async () => ({ total: 0 }));
    const completeWithTools = vi
      .fn<(input: AiCompletionInput) => Promise<AiToolCompletion>>()
      .mockResolvedValueOnce(
        toolCompletion({
          toolCalls: [{ id: "c", name: "search_fiches", arguments: "{oops" }],
        }),
      )
      .mockResolvedValueOnce(toolCompletion({ content: "Je reformule." }));
    const ai = client({ completeWithTools });

    const output = await runToolLoop({
      ai,
      system: "Système",
      messages: [],
      supportsToolCalling: true,
      tools: TOOLS,
      executeTool,
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(output.content).toBe("Je reformule.");
  });
});

describe("runToolLoop — planner JSON de secours", () => {
  it("exécute l'action planner puis la réponse finale", async () => {
    const executeTool = vi.fn(async () => SEARCH_RESULT);
    const complete = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('{"action":"search_fiches","arguments":{"query":"maison"}}')
      .mockResolvedValueOnce('{"action":"final","text":"Voici une maison."}');
    const ai = client({ complete });

    const output = await runToolLoop({
      ai,
      system: "Système",
      messages: [],
      supportsToolCalling: false,
      tools: TOOLS,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith("search_fiches", { query: "maison" });
    expect(output.toolCallCount).toBe(1);
    expect(output.content).toBe("Voici une maison.");
    expect(output.blocks[0]?.type).toBe("tool_search_result");
  });

  it("retente une fois un JSON invalide puis répond sans outil", async () => {
    const executeTool = vi.fn(async () => SEARCH_RESULT);
    const complete = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("pas du json")
      .mockResolvedValueOnce("toujours pas")
      .mockResolvedValueOnce("Réponse sans outil");
    const ai = client({ complete });

    const output = await runToolLoop({
      ai,
      system: "Système",
      messages: [],
      supportsToolCalling: false,
      tools: TOOLS,
      executeTool,
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(3);
    expect(output.content).toBe("Réponse sans outil");
    expect(output.blocks).toEqual([{ type: "text", text: "Réponse sans outil" }]);
  });
});

describe("projections et parsing", () => {
  it("la projection modèle retire statuts et champs fichier", () => {
    const projected = toModelItems({
      ...SEARCH_RESULT,
      items: [
        {
          ficheId: "f1",
          fields: [...FIELDS, { key: "cin", label: "CIN", type: "file", value: "secret.pdf" }],
          statusKey: "publie",
        },
      ],
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).toContain("Maison A");
    expect(serialized).not.toContain("statusKey");
    expect(serialized).not.toContain("secret.pdf");
    expect(serialized).not.toContain("file");
  });

  it("la projection template produit des champs typés et retombe en texte pour count", () => {
    const blocks = toTemplateBlocks("search_fiches", SEARCH_RESULT);
    expect(blocks[0]).toMatchObject({ type: "tool_search_result", tool: "search_fiches" });
    expect(toTemplateBlocks("count_fiches", { total: 3 })).toEqual([
      { type: "text", text: "3 fiche(s)" },
    ]);
  });

  it("parseToolArguments refuse un JSON non-objet", () => {
    expect(parseToolArguments("{oops")).toEqual({ ok: false, error: "Arguments JSON invalides" });
    expect(parseToolArguments("[1]")).toEqual({
      ok: false,
      error: "Arguments JSON : objet attendu",
    });
    expect(parseToolArguments("")).toEqual({ ok: true, value: {} });
    expect(parseToolArguments('{"limit":5}')).toEqual({ ok: true, value: { limit: 5 } });
  });
});
