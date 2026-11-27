import type { TemplateParamValues } from "@/domain/template-params";
import type { AgentAttempt } from "./agent-attempt";
import type { AgentInteractionRequest } from "./agent-interaction";
import type { AgentOperationalMemory } from "./agent-memory";
import type { MissionProgress } from "./mission-objective";

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
  memory: AgentOperationalMemory;
  missionProgress?: MissionProgress;
  messages: unknown[];
  revisions: unknown[];
  budget: {
    attemptsUsed: number;
    startedAt: string;
    elapsedMs: number;
    aiCallsUsed: number;
  };
};
