import { describe, expect, it, vi } from "vitest";
import type { AgentAttempt } from "@/application/use-cases/visual-templates/agent-poc/agent-attempt";
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
    logs: [
      {
        stepId: "step-1",
        label: "Étape 1",
        operation: { op: "set" },
        status: "success",
        summary: "set",
        itemId: null,
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
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
    const seenAttempts: AgentAttempt[] = [];
    const result = await runAgentLoop({
      goal: "modifier le titre",
      values: {},
      ports: {
        initialObservation: async () => observation(1),
        plan: async (input) => {
          attempts += 1;
          if (attempts === 2 && input.lastAttempt !== null) seenAttempts.push(input.lastAttempt);
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
    expect(seenAttempts[0]?.transactionStatus).toBe("rolled_back");
    expect(seenAttempts[0]?.steps[0]?.effect).toBe("rolled_back");
    expect(seenAttempts[0]?.steps[0]?.replayRequired).toBe(true);
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
