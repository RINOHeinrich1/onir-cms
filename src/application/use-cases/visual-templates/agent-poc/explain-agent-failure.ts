import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AgentAttempt } from "./agent-attempt";
import type { AgentLoopEvent } from "./agent-loop";
import type { AgentObservation } from "./agent-observation";

export type ExplainAgentFailureInput = {
  request: string;
  reason: string;
  trace: AgentLoopEvent[];
  attempt: AgentAttempt | null;
  observation: AgentObservation;
};

export type ExplainAgentFailureDependencies = {
  aiFactory: AiClientFactory;
};

const SYSTEM = [
  "Tu es l’assistant d’édition d’interface d’ONIR-CMS.",
  "Tu expliques à un utilisateur non technique pourquoi une demande n’a pas pu être appliquée.",
  "Tu dois t’appuyer uniquement sur les faits fournis : demande, trace, tentative, erreurs et observation.",
  "Réponds en français, en 2 à 5 phrases maximum.",
  "Explique ce que tu as compris, la cause probable et une ou deux façons de reformuler ou de procéder.",
  "Ne prétends jamais que la modification a été appliquée.",
  "N’affiche pas d’identifiants internes, de noms de collections, de codes d’erreur bruts ni de logs JSON.",
  "Ne demande pas de détails que les données fournies contiennent déjà.",
].join("\n");

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function compactAttempt(attempt: AgentAttempt | null): unknown {
  if (attempt === null) return null;
  return {
    baseHash: attempt.baseHash,
    candidateHash: attempt.candidateHash,
    committedHash: attempt.committedHash,
    transactionStatus: attempt.transactionStatus,
    errors: attempt.errors,
    referenceErrors: attempt.referenceErrors,
    postconditions: attempt.postconditions,
    steps: attempt.steps.map((step) => ({
      stepId: step.stepId,
      status: step.status,
      effect: step.effect,
      replayRequired: step.replayRequired,
      error: step.error,
    })),
  };
}

export async function explainAgentFailure(
  deps: ExplainAgentFailureDependencies,
  actor: Actor,
  input: ExplainAgentFailureInput,
): Promise<string> {
  assertCan(actor, "links:update");
  assertCan(actor, "ai:read");
  const organizationId = organizationOf(actor);
  const target = { organizationId, aiProviderId: null, aiModel: null };
  const resolved =
    deps.aiFactory.resolveForUsage !== undefined
      ? await deps.aiFactory.resolveForUsage(target, "assistant")
      : await deps.aiFactory.resolve(target);
  const resolvedTarget =
    resolved.providerId === null
      ? target
      : {
          organizationId,
          aiProviderId: resolved.providerId,
          aiModel: resolved.model,
          aiClusterId: resolved.clusterId ?? null,
        };
  const client = await deps.aiFactory.forTarget(resolvedTarget, "assistant");
  const context = {
    request: input.request,
    reason: input.reason,
    observation: {
      revision: input.observation.revision,
      stateHash: input.observation.stateHash,
      counts: input.observation.counts,
      render: input.observation.render,
    },
    attempt: compactAttempt(input.attempt),
    trace: input.trace.map((event) => ({
      phase: event.phase,
      status: event.status,
      title: event.title,
      detail: event.detail,
      attempt: event.attempt,
      stepId: event.stepId,
    })),
  };
  const message = await client.complete({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: truncate(JSON.stringify(context), 24_000),
      },
    ],
    maxTokens: 1_200,
    usageOperation: "agent_failure_explanation",
    reasoning: "disabled",
  });
  return truncate(message.trim(), 2_500);
}
