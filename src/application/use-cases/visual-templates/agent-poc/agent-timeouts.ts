export type AgentTimeouts = {
  planMs: number;
  executeMs: number;
  verifyMs: number;
  explainMs: number;
  missionMs: number;
  providerMs: number;
};

export const DEFAULT_AGENT_TIMEOUTS: AgentTimeouts = {
  planMs: 240_000,
  executeMs: 120_000,
  verifyMs: 60_000,
  explainMs: 60_000,
  missionMs: 900_000,
  providerMs: 240_000,
};
