import { describe, expect, it, vi } from "vitest";
import {
  type AgentExecutionOutcome,
  type AgentLoopEvent,
  runAgentLoop,
} from "@/application/use-cases/visual-templates/agent-poc/agent-loop";
import type { AgentObservation } from "@/application/use-cases/visual-templates/agent-poc/agent-observation";

function observation(revision: number): AgentObservation {
  return {
    revision,
    stateHash: `state-${revision}`,
    counts: {
      pages: 0,
      regions: 0,
      blocks: 0,
      placements: 0,
      actions: 0,
      styles: 0,
    },
    pages: [],
    blocks: [],
    placements: [],
    actions: [],
    styles: [],
    render: {
      revision,
      text: `render-${revision}`,
      header: "",
      main: `render-${revision}`,
    },
  };
}

function execution(ok: boolean): AgentExecutionOutcome {
  return {
    ok,
    values: {},
    logs: [],
    errors: ok ? [] : ["postcondition"],
    referenceErrors: [],
    verification: { ok, checks: [] },
  };
}

describe("boucle agentique", () => {
  it("passe de la pensée à l’action puis à la décision de succès", async () => {
    const events: AgentLoopEvent[] = [];
    const success = await runAgentLoop({
      goal: "modifier le titre",
      values: {},
      ports: {
        initialObservation: async () => observation(1),
        plan: async () => ({
          status: "planned",
          rawPlan: { step: "one" },
          warnings: [],
          attempts: 1,
        }),
        execute: async () => execution(true),
        observeCandidate: async () => observation(2),
        restore: async () => observation(1),
        verify: async () => ({ satisfied: true, reason: "ok", missing: "" }),
        emit: (event) => events.push(event),
      },
    });

    expect(success.status).toBe("success");
    expect(success.attempts).toBe(1);
    expect(events.map((event) => event.phase)).toEqual(
      expect.arrayContaining([
        "initial-observation",
        "thought",
        "action",
        "observation",
        "decision",
      ]),
    );
  });

  it("rollback et retente après une exécution invalide", async () => {
    const restore = vi.fn(async () => observation(1));
    let attempts = 0;
    const result = await runAgentLoop({
      goal: "modifier le titre",
      values: {},
      ports: {
        initialObservation: async () => observation(1),
        plan: async () => {
          attempts += 1;
          return {
            status: "planned",
            rawPlan: { step: attempts },
            warnings: [],
            attempts: 1,
          };
        },
        execute: async () => execution(attempts > 1),
        observeCandidate: async () => observation(2),
        restore,
        verify: async () => ({ satisfied: true, reason: "ok", missing: "" }),
        emit: () => undefined,
      },
    });

    expect(result.status).toBe("success");
    expect(result.attempts).toBe(2);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("bloque quand le planner repropose le même plan", async () => {
    const result = await runAgentLoop({
      goal: "modifier le titre",
      values: {},
      ports: {
        initialObservation: async () => observation(1),
        plan: async () => ({
          status: "planned",
          rawPlan: { step: "same" },
          warnings: [],
          attempts: 1,
        }),
        execute: async () => execution(false),
        observeCandidate: async () => observation(2),
        restore: async () => observation(1),
        verify: async () => ({ satisfied: false, reason: "non", missing: "titre" }),
        emit: () => undefined,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.attempts).toBe(2);
  });
});
