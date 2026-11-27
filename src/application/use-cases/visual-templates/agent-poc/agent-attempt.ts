export type AgentAttemptStep = {
  stepId: string;
  status: "success" | "failed" | "skipped";
  effect: "applied_to_candidate" | "rolled_back" | "committed" | "not_applied";
  replayRequired: boolean;
  error: string | null;
  operation: unknown;
  itemId: string | null;
};

export type AgentAttemptPostcondition = {
  stepId: string;
  ok: boolean;
  message: string;
};

export type AgentAttempt = {
  attemptId: string;
  baseHash: string;
  candidateHash: string | null;
  committedHash: string;
  transactionStatus: "applied" | "rolled_back" | "committed" | "inconsistent";
  steps: AgentAttemptStep[];
  referenceErrors: string[];
  postconditions: AgentAttemptPostcondition[];
  errors: string[];
  planRaw: unknown;
};
