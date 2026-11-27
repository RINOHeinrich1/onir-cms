import type { TemplateParamValues } from "@/domain/template-params";
import type { AgentAttempt } from "./agent-attempt";
import { type AgentObservation, hashAgentState } from "./agent-observation";

export type AgentLoopPhase =
  | "initial-observation"
  | "thought"
  | "action"
  | "observation"
  | "decision";
export type AgentLoopStatus = "running" | "success" | "warning" | "error";

export type AgentLoopEvent = {
  phase: AgentLoopPhase;
  title: string;
  detail?: string;
  status: AgentLoopStatus;
  attempt?: number;
  stepId?: string;
};

export type AgentPlanOutcome =
  | {
      status: "planned";
      rawPlan: unknown;
      warnings: string[];
      attempts: number;
    }
  | {
      status: "clarification" | "noop";
      message: string;
      rawPlan: unknown;
      warnings: string[];
      attempts: number;
    }
  | {
      status: "rejected";
      errors: string[];
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
    };

export type AgentExecutionLog = {
  stepId: string;
  label: string;
  operation: unknown;
  status: "success" | "error";
  summary: string;
  itemId: string | null;
  startedAt: string;
  endedAt: string;
};

export type AgentDeterministicVerification = {
  ok: boolean;
  checks: Array<{
    stepId: string;
    ok: boolean;
    message: string;
  }>;
};

export type AgentExecutionOutcome = {
  ok: boolean;
  values: TemplateParamValues;
  logs: AgentExecutionLog[];
  errors: string[];
  referenceErrors: string[];
  verification: AgentDeterministicVerification;
};

export type AgentVerifyOutcome = {
  satisfied: boolean;
  reason: string;
  missing: string;
};

export type AgentLoopPorts = {
  initialObservation: () => Promise<AgentObservation>;
  plan: (input: {
    request: string;
    values: TemplateParamValues;
    observation: AgentObservation;
    lastAttempt: AgentAttempt | null;
    previousPlan: unknown;
    previousErrors: string[];
  }) => Promise<AgentPlanOutcome>;
  execute: (input: {
    values: TemplateParamValues;
    rawPlan: unknown;
  }) => Promise<AgentExecutionOutcome>;
  observeCandidate: (values: TemplateParamValues) => Promise<AgentObservation>;
  restore: (values: TemplateParamValues) => Promise<AgentObservation>;
  verify: (input: {
    goal: string;
    observation: AgentObservation;
    execution: AgentExecutionOutcome;
  }) => Promise<AgentVerifyOutcome>;
  emit: (event: AgentLoopEvent) => void;
  now?: () => number;
};

export type AgentLoopResult =
  | {
      status: "success";
      values: TemplateParamValues;
      observation: AgentObservation;
      attempts: number;
      lastAttempt: AgentAttempt | null;
    }
  | {
      status: "failed" | "blocked";
      reason: string;
      values: TemplateParamValues;
      observation: AgentObservation;
      attempts: number;
      lastAttempt: AgentAttempt | null;
    }
  | {
      status: "clarification";
      reason: string;
      values: TemplateParamValues;
      observation: AgentObservation;
      attempts: number;
      lastAttempt: AgentAttempt | null;
    };

export const AGENT_MAX_ITERATIONS = 10;
export const AGENT_MAX_DURATION_MS = 180_000;
export const AGENT_MAX_SAME_ERROR = 2;

function errorSignature(errors: string[]): string {
  return errors
    .map((entry) => entry.trim().replace(/\s+/g, " "))
    .sort()
    .join("|");
}

function planSignature(rawPlan: unknown): string {
  return JSON.stringify(rawPlan ?? null);
}

function rolledBack(attempt: AgentAttempt): AgentAttempt {
  return {
    ...attempt,
    transactionStatus: "rolled_back",
    steps: attempt.steps.map((step) => ({
      ...step,
      effect: "rolled_back",
      replayRequired: true,
    })),
  };
}

function committed(attempt: AgentAttempt, candidateHash: string): AgentAttempt {
  return {
    ...attempt,
    candidateHash,
    committedHash: candidateHash,
    transactionStatus: "committed",
    steps: attempt.steps.map((step) => ({
      ...step,
      effect: step.status === "success" ? "committed" : "not_applied",
      replayRequired: step.status !== "success",
    })),
  };
}

/**
 * Exécute la boucle fidèle :
 * observation initiale -> pensée -> action -> observation -> décision -> commit/rollback.
 * Chaque tentative est matérialisée par un Attempt ; les succès rollbackés
 * restent des informations de diagnostic et ne sont jamais considérés comme acquis.
 */
export async function runAgentLoop(input: {
  goal: string;
  values: TemplateParamValues;
  ports: AgentLoopPorts;
}): Promise<AgentLoopResult> {
  const now = input.ports.now ?? Date.now;
  const startedAt = now();
  const currentValues = input.values;
  let currentObservation = await input.ports.initialObservation();
  const committedHash = currentObservation.stateHash;
  let lastAttempt: AgentAttempt | null = null;
  let previousPlan: unknown = null;
  let previousErrors: string[] = [];
  let lastErrorSignature = "";
  let sameErrorCount = 0;
  let seenPlan = "";
  let seenBaseHash = "";
  let attempt = 0;

  input.ports.emit({
    phase: "initial-observation",
    title: "Observation initiale",
    detail: `révision ${currentObservation.revision} · ${currentObservation.counts.blocks} blocs`,
    status: "success",
  });

  while (attempt < AGENT_MAX_ITERATIONS) {
    if (now() - startedAt > AGENT_MAX_DURATION_MS) {
      input.ports.emit({
        phase: "decision",
        title: "Décision : arrêt",
        detail: "Durée maximale dépassée.",
        status: "error",
      });
      return {
        status: "blocked",
        reason: "Durée maximale dépassée.",
        values: currentValues,
        observation: currentObservation,
        attempts: attempt,
        lastAttempt,
      };
    }

    attempt += 1;
    const baseHash = committedHash;
    input.ports.emit({
      phase: "thought",
      title: `Pensée ${attempt}/${AGENT_MAX_ITERATIONS}`,
      detail: "Construction du plan depuis l’état committed",
      status: "running",
      attempt,
    });

    const planned = await input.ports.plan({
      request: input.goal,
      values: currentValues,
      observation: currentObservation,
      lastAttempt,
      previousPlan,
      previousErrors,
    });

    if (planned.status === "clarification") {
      input.ports.emit({
        phase: "decision",
        title: "Décision : clarification",
        detail: planned.message,
        status: "warning",
        attempt,
      });
      return {
        status: "clarification",
        reason: planned.message,
        values: currentValues,
        observation: currentObservation,
        attempts: attempt,
        lastAttempt,
      };
    }

    if (planned.status === "noop") {
      input.ports.emit({
        phase: "decision",
        title: "Décision : succès",
        detail: planned.message,
        status: "success",
        attempt,
      });
      return {
        status: "success",
        values: currentValues,
        observation: currentObservation,
        attempts: attempt,
        lastAttempt,
      };
    }

    if (planned.status === "rejected") {
      previousErrors = planned.errors;
      previousPlan = planned.rawPlan;
      const signature = errorSignature(planned.errors);
      sameErrorCount = signature === lastErrorSignature ? sameErrorCount + 1 : 1;
      lastErrorSignature = signature;
      input.ports.emit({
        phase: "decision",
        title: "Décision : plan rejeté",
        detail: planned.errors.join(" ; ") || "Plan rejeté.",
        status: "warning",
        attempt,
      });
      if (sameErrorCount >= AGENT_MAX_SAME_ERROR) {
        return {
          status: "blocked",
          reason: planned.errors.join(" ; ") || "Même erreur de plan répétée.",
          values: currentValues,
          observation: currentObservation,
          attempts: attempt,
          lastAttempt,
        };
      }
      continue;
    }

    const signature = planSignature(planned.rawPlan);
    if (signature === seenPlan && baseHash === seenBaseHash) {
      input.ports.emit({
        phase: "decision",
        title: "Décision : arrêt",
        detail: "Le planner a reproposé le même plan sur le même état de départ.",
        status: "error",
        attempt,
      });
      return {
        status: "blocked",
        reason: "Le planner a reproposé le même plan sur le même état de départ.",
        values: currentValues,
        observation: currentObservation,
        attempts: attempt,
        lastAttempt,
      };
    }
    seenPlan = signature;
    seenBaseHash = baseHash;
    input.ports.emit({
      phase: "thought",
      title: "Plan accepté",
      detail: `${planned.warnings.length} warning(s)`,
      status: "success",
      attempt,
    });

    input.ports.emit({
      phase: "action",
      title: `Action ${attempt}/${AGENT_MAX_ITERATIONS}`,
      detail: "Exécution pas à pas sur l’état candidat",
      status: "running",
      attempt,
    });

    const execution = await input.ports.execute({
      values: currentValues,
      rawPlan: planned.rawPlan,
    });
    const candidateHash = hashAgentState(execution.values);
    let currentAttempt: AgentAttempt = {
      attemptId: `attempt-${attempt}`,
      baseHash,
      candidateHash,
      committedHash,
      transactionStatus: "applied",
      steps: execution.logs.map((log) => ({
        stepId: log.stepId,
        status: log.status === "success" ? "success" : "failed",
        effect: log.status === "success" ? "applied_to_candidate" : "not_applied",
        replayRequired: true,
        error: log.status === "error" ? log.summary : null,
        operation: log.operation,
        itemId: log.itemId,
      })),
      referenceErrors: execution.referenceErrors,
      postconditions: execution.verification.checks,
      errors: execution.errors,
      planRaw: planned.rawPlan,
    };

    for (const log of execution.logs) {
      input.ports.emit({
        phase: "action",
        title: log.label,
        detail: `${log.status} · ${log.summary}`,
        status: log.status === "success" ? "success" : "error",
        attempt,
        stepId: log.stepId,
      });
    }

    if (!execution.ok || !execution.verification.ok) {
      const errors = [
        ...execution.errors,
        ...execution.referenceErrors,
        ...execution.verification.checks.filter((check) => !check.ok).map((check) => check.message),
      ];
      currentAttempt = { ...currentAttempt, errors };
      lastAttempt = rolledBack(currentAttempt);
      previousPlan = planned.rawPlan;
      previousErrors = errors;
      const errorSignatureValue = errorSignature(errors);
      sameErrorCount = errorSignatureValue === lastErrorSignature ? sameErrorCount + 1 : 1;
      lastErrorSignature = errorSignatureValue;
      input.ports.emit({
        phase: "observation",
        title: "Observation : échec d’exécution",
        detail: errors.join(" ; ") || "L’exécution n’a pas satisfait les contrôles.",
        status: "error",
        attempt,
      });
      currentObservation = await input.ports.restore(currentValues);
      input.ports.emit({
        phase: "decision",
        title: "Décision : rollback",
        detail: "État committed restauré.",
        status: "warning",
        attempt,
      });
      if (sameErrorCount >= AGENT_MAX_SAME_ERROR) {
        return {
          status: "blocked",
          reason: errors.join(" ; ") || "Même erreur d’exécution répétée.",
          values: currentValues,
          observation: currentObservation,
          attempts: attempt,
          lastAttempt,
        };
      }
      continue;
    }

    let candidateObservation: AgentObservation;
    try {
      candidateObservation = await input.ports.observeCandidate(execution.values);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Observation du candidat impossible.";
      currentAttempt = { ...currentAttempt, errors: [message] };
      lastAttempt = rolledBack(currentAttempt);
      previousPlan = planned.rawPlan;
      previousErrors = [message];
      input.ports.emit({
        phase: "observation",
        title: "Observation : aperçu indisponible",
        detail: message,
        status: "error",
        attempt,
      });
      currentObservation = await input.ports.restore(currentValues);
      continue;
    }

    currentAttempt = {
      ...currentAttempt,
      candidateHash: candidateObservation.stateHash,
      committedHash,
    };
    input.ports.emit({
      phase: "observation",
      title: "Observation du candidat",
      detail: `révision ${candidateObservation.revision} · état ${candidateObservation.stateHash}`,
      status: "success",
      attempt,
    });

    const verified = await input.ports.verify({
      goal: input.goal,
      observation: candidateObservation,
      execution,
    });

    if (verified.satisfied) {
      const finalAttempt = committed(currentAttempt, candidateObservation.stateHash);
      lastAttempt = finalAttempt;
      input.ports.emit({
        phase: "decision",
        title: "Décision : succès",
        detail: verified.reason || "Objectif atteint.",
        status: "success",
        attempt,
      });
      return {
        status: "success",
        values: execution.values,
        observation: candidateObservation,
        attempts: attempt,
        lastAttempt,
      };
    }

    const reason =
      verified.missing || verified.reason || "Le candidat ne satisfait pas l’objectif.";
    currentAttempt = { ...currentAttempt, errors: [reason] };
    lastAttempt = rolledBack(currentAttempt);
    previousPlan = planned.rawPlan;
    previousErrors = [reason];
    const errorSignatureValue = errorSignature([reason]);
    sameErrorCount = errorSignatureValue === lastErrorSignature ? sameErrorCount + 1 : 1;
    lastErrorSignature = errorSignatureValue;
    input.ports.emit({
      phase: "observation",
      title: "Observation : objectif non satisfait",
      detail: reason,
      status: "warning",
      attempt,
    });
    currentObservation = await input.ports.restore(currentValues);
    input.ports.emit({
      phase: "decision",
      title: "Décision : correction",
      detail: "Rollback puis nouvelle pensée depuis l’état committed.",
      status: "warning",
      attempt,
    });

    if (sameErrorCount >= AGENT_MAX_SAME_ERROR) {
      return {
        status: "blocked",
        reason,
        values: currentValues,
        observation: currentObservation,
        attempts: attempt,
        lastAttempt,
      };
    }
  }

  input.ports.emit({
    phase: "decision",
    title: "Décision : arrêt",
    detail: "Budget d’itérations épuisé.",
    status: "error",
    attempt,
  });
  return {
    status: "failed",
    reason: "Budget d’itérations épuisé.",
    values: currentValues,
    observation: currentObservation,
    attempts: attempt,
    lastAttempt,
  };
}
