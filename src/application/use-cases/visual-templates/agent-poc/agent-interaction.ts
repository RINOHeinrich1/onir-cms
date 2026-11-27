export type AgentInteractionOption = {
  id: string;
  label: string;
  description?: string;
};

export type AgentInteractionRequest = {
  id: string;
  sourcePhase: "thought" | "observation";
  kind: "clarification" | "confirmation" | "choice" | "correction" | "missing";
  question: string;
  options: AgentInteractionOption[];
  allowFreeText: true;
  context?: unknown;
};

export type AgentInteractionResponse = {
  requestId: string;
  optionId?: string;
  text?: string;
};
