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
  values?: unknown;
  history?: unknown;
  skills?: unknown;
  capabilities?: unknown;
  candidates?: unknown;
  signal?: AbortSignal;
};

export type ExplainAgentFailureDependencies = {
  aiFactory: AiClientFactory;
};

const SYSTEM = [
  "Tu es l’assistant d’édition d’interface d’ONIR-CMS.",
  "Tu es aussi un correcteur de plans d’édition d’interface.",
  "Tu expliques à un utilisateur non technique pourquoi une demande n’a pas pu être appliquée, puis tu proposes la correction la plus probable.",
  "Tu dois t’appuyer sur tous les faits fournis : demande, historique, trace, tentative, observation, valeurs, skills, capacités et candidats.",
  "Analyse les erreurs et les contraintes du template avant de conclure.",
  "Propose une démarche étape par étape pour corriger le problème, avec les contraintes à respecter.",
  "Ne demande à l’utilisateur que les informations réellement absentes du contexte.",
  "Ne lui demande pas de reformuler une demande dont les informations sont déjà présentes dans l’historique, l’observation ou les valeurs.",
  "Si la correction peut être préparée sans information supplémentaire, décris ce que l’agent doit faire, pas ce que l’utilisateur doit répéter.",
  "Réponds en français, en 3 à 6 phrases maximum.",
  "Ne prétends jamais que la modification a été appliquée.",
  "N’affiche pas d’identifiants internes, de noms de collections, de codes d’erreur bruts ni de logs JSON.",
  "N’écris jamais de token technique entre backticks, de nom en snake_case, de slug interne, d’UUID ou de nom de collection.",
  "Désigne les éléments par leur libellé visible : « la page Services », « le menu principal », « la liste des services ».",
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
    values: input.values,
    history: input.history,
    skills: input.skills,
    capabilities: input.capabilities,
    candidates: input.candidates,
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
    maxTokens: 1_600,
    usageOperation: "agent_failure_explanation",
    reasoning: "disabled",
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  return truncate(message.trim(), 2_500);
}
