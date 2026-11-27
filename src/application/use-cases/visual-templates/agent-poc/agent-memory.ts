import type { AgentAttempt } from "./agent-attempt";

export type AgentErrorKind = "temporary" | "plan" | "constraint" | "state" | "fatal";

export type AgentMemoryError = {
  key: string;
  signature: string;
  kind: AgentErrorKind;
  message: string;
  count: number;
  baseHash: string;
  lastSeenAt: string;
};

export type AgentOperationalMemory = {
  version: 1;
  errors: AgentMemoryError[];
  recentFailures: Array<{ baseHash: string; signature: string }>;
  constraints: string[];
  failedStrategies: string[];
  successfulStrategies: string[];
  validatedOperations: string[];
  cancelledOperations: string[];
};

const MAX_ERRORS = 12;
const MAX_RECENT = 8;
const MAX_OPERATIONS = 20;

export function emptyAgentMemory(): AgentOperationalMemory {
  return {
    version: 1,
    errors: [],
    recentFailures: [],
    constraints: [],
    failedStrategies: [],
    successfulStrategies: [],
    validatedOperations: [],
    cancelledOperations: [],
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function errorSignature(errors: string[]): string {
  return errors.map(normalize).filter(Boolean).sort().join("|");
}

export function classifyAgentError(message: string): AgentErrorKind {
  if (/shared|partagé|scope|contrainte|optional|référence/i.test(message)) return "constraint";
  if (/timeout|délai|unavailable|indisponible|network|réseau/i.test(message)) return "temporary";
  if (/inconsistent|rollback|état/i.test(message)) return "state";
  if (/INVALID_|candidate|champ|opération|plan/i.test(message)) return "plan";
  return "fatal";
}

function uniquePush(target: string[], values: string[]): string[] {
  return [...new Set([...target, ...values])].slice(-MAX_OPERATIONS);
}

function recordError(input: {
  memory: AgentOperationalMemory;
  signature: string;
  kind: AgentErrorKind;
  message: string;
  baseHash: string;
}): void {
  const key = `${input.baseHash}|${input.signature}`;
  const existing = input.memory.errors.find((entry) => entry.key === key);
  if (existing !== undefined) {
    existing.count += 1;
    existing.lastSeenAt = new Date().toISOString();
  } else {
    input.memory.errors = [
      ...input.memory.errors.slice(-(MAX_ERRORS - 1)),
      {
        key,
        signature: input.signature,
        kind: input.kind,
        message: input.message,
        count: 1,
        baseHash: input.baseHash,
        lastSeenAt: new Date().toISOString(),
      },
    ];
  }
  input.memory.recentFailures = [
    ...input.memory.recentFailures.slice(-(MAX_RECENT - 1)),
    { baseHash: input.baseHash, signature: input.signature },
  ];
}

export function recordPlanFailure(
  memory: AgentOperationalMemory,
  errors: string[],
  baseHash: string,
  strategy: string,
): void {
  const signature = errorSignature(errors);
  if (signature === "") return;
  const message = errors.join(" ; ");
  recordError({ memory, signature, kind: classifyAgentError(message), message, baseHash });
  memory.failedStrategies = uniquePush(memory.failedStrategies, [strategy]);
  if (classifyAgentError(message) === "constraint") {
    memory.constraints = uniquePush(memory.constraints, errors);
  }
}

function stepOperations(attempt: AgentAttempt): string[] {
  return attempt.steps.map(
    (step) => `${step.operation ? JSON.stringify(step.operation) : step.stepId}`,
  );
}

export function recordAttemptMemory(
  memory: AgentOperationalMemory,
  attempt: AgentAttempt,
  strategy: string,
): void {
  const errors = [
    ...attempt.errors,
    ...attempt.referenceErrors,
    ...attempt.steps.flatMap((step) => (step.error === null ? [] : [step.error])),
  ].filter((error) => error.trim() !== "");
  const signature = errorSignature(errors);
  if (signature !== "") {
    recordError({
      memory,
      signature,
      kind: classifyAgentError(errors.join(" ; ")),
      message: errors.join(" ; "),
      baseHash: attempt.baseHash,
    });
    memory.failedStrategies = uniquePush(memory.failedStrategies, [strategy]);
    if (classifyAgentError(errors.join(" ; ")) === "constraint") {
      memory.constraints = uniquePush(memory.constraints, errors);
    }
  }
  if (attempt.transactionStatus === "committed") {
    memory.successfulStrategies = uniquePush(memory.successfulStrategies, [strategy]);
    memory.validatedOperations = uniquePush(memory.validatedOperations, stepOperations(attempt));
  }
  if (attempt.transactionStatus === "rolled_back") {
    memory.cancelledOperations = uniquePush(memory.cancelledOperations, stepOperations(attempt));
  }
}

export function shouldStopForRepeatedError(
  memory: AgentOperationalMemory,
  baseHash: string,
  signature: string,
): boolean {
  const entry = memory.errors.find(
    (error) => error.baseHash === baseHash && error.signature === signature,
  );
  if (entry !== undefined && entry.count >= 2) return true;
  const recent = memory.recentFailures.filter((failure) => failure.baseHash === baseHash);
  if (recent.length >= 4) {
    const tail = recent.slice(-4).map((failure) => failure.signature);
    return tail[0] === tail[2] && tail[1] === tail[3] && tail[0] !== tail[1];
  }
  return false;
}
