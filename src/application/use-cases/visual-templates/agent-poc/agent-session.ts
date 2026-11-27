import type { TemplateParamValues } from "@/domain/template-params";
import type { AgentAttempt } from "./agent-attempt";
import type { AgentInteractionRequest } from "./agent-interaction";

export type AgentPocStatus = "active" | "waiting_user" | "paused" | "completed" | "cancelled";

export type AgentPocSessionState = {
  version: 1;
  goal: string;
  status: AgentPocStatus;
  acceptedValues: TemplateParamValues;
  acceptedHash: string | null;
  currentRevisionId: string;
  lastAttempt: AgentAttempt | null;
  interaction: AgentInteractionRequest | null;
  messages: unknown[];
  revisions: unknown[];
  budget: {
    attemptsUsed: number;
    startedAt: string;
    elapsedMs: number;
    aiCallsUsed: number;
  };
};
