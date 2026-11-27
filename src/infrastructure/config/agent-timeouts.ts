import {
  type AgentTimeouts,
  DEFAULT_AGENT_TIMEOUTS,
} from "@/application/use-cases/visual-templates/agent-poc/agent-timeouts";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function resolveAgentTimeouts(env: NodeJS.ProcessEnv = process.env): AgentTimeouts {
  return {
    planMs: positiveInteger(env.AGENT_PLAN_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUTS.planMs),
    executeMs: positiveInteger(env.AGENT_EXECUTE_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUTS.executeMs),
    verifyMs: positiveInteger(env.AGENT_VERIFY_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUTS.verifyMs),
    explainMs: positiveInteger(env.AGENT_EXPLAIN_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUTS.explainMs),
    missionMs: positiveInteger(env.AGENT_MISSION_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUTS.missionMs),
    providerMs: positiveInteger(env.AI_REQUEST_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUTS.providerMs),
  };
}
