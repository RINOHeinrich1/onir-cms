import { describe, expect, it } from "vitest";
import {
  emptyAgentMemory,
  recordPlanFailure,
  shouldStopForRepeatedError,
} from "@/application/use-cases/visual-templates/agent-poc/agent-memory";

describe("mémoire opérationnelle de mission", () => {
  it("détecte une alternance d’erreurs sur le même état", () => {
    const memory = emptyAgentMemory();
    recordPlanFailure(memory, ["INVALID_OPERATION A"], "base-1", "plan-a");
    recordPlanFailure(memory, ["INVALID_CANDIDATE_ID B"], "base-1", "plan-b");
    recordPlanFailure(memory, ["INVALID_OPERATION A"], "base-1", "plan-a");
    recordPlanFailure(memory, ["INVALID_CANDIDATE_ID B"], "base-1", "plan-b");

    expect(shouldStopForRepeatedError(memory, "base-1", "INVALID_OPERATION A")).toBe(true);
    expect(memory.failedStrategies).toEqual(["plan-a", "plan-b"]);
  });

  it("autorise une nouvelle stratégie après changement d’état", () => {
    const memory = emptyAgentMemory();
    recordPlanFailure(memory, ["INVALID_OPERATION A"], "base-1", "plan-a");
    recordPlanFailure(memory, ["INVALID_OPERATION A"], "base-1", "plan-a");

    expect(shouldStopForRepeatedError(memory, "base-1", "INVALID_OPERATION A")).toBe(true);
    expect(shouldStopForRepeatedError(memory, "base-2", "INVALID_OPERATION A")).toBe(false);
  });
});
