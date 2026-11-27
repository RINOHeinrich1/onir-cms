import { describe, expect, it } from "vitest";
import { verifyAgentExecution } from "@/application/use-cases/visual-templates/agent-poc/agent-execution-verification";
import type { AgentExecutionLog } from "@/application/use-cases/visual-templates/agent-poc/agent-loop";
import { puzzleV2Values } from "./fixtures/puzzle-v2-reference";

function logs(value: string): AgentExecutionLog[] {
  return [
    {
      stepId: "title",
      label: "Modifier le titre",
      operation: {
        op: "set",
        target: {
          kind: "collectionItemField",
          collection: "blocks",
          itemKey: "id",
          itemId: "hero_main",
          field: "title",
        },
        value,
      },
      status: "success",
      summary: "set",
      itemId: null,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    },
  ];
}

function withTitle(title: string) {
  return {
    ...JSON.parse(JSON.stringify(puzzleV2Values)),
    blocks: (puzzleV2Values.blocks ?? []).map((block) =>
      block.id === "hero_main" ? { ...block, title } : block,
    ),
  } as typeof puzzleV2Values;
}

describe("vérification déterministe de l’exécution", () => {
  it("valide une postcondition de set", () => {
    const result = verifyAgentExecution({
      before: puzzleV2Values,
      after: withTitle("Bienvenue"),
      logs: logs("Bienvenue"),
    });
    expect(result.ok).toBe(true);
    expect(result.checks[0]?.ok).toBe(true);
  });

  it("refuse une postcondition non satisfaite", () => {
    const result = verifyAgentExecution({
      before: puzzleV2Values,
      after: withTitle("Ancien titre"),
      logs: logs("Bienvenue"),
    });
    expect(result.ok).toBe(false);
    expect(result.checks[0]?.ok).toBe(false);
  });
});
