import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import { type MissionDecomposition, validateMissionDecomposition } from "./mission-objective";

export type DecomposeMissionInput = {
  goal: string;
  constraints: string[];
  observation?: unknown;
  history?: unknown;
  memory?: unknown;
  signal?: AbortSignal;
};

export type DecomposeMissionDependencies = {
  aiFactory: AiClientFactory;
};

const SYSTEM = [
  "Tu es le décomposeur de missions de l’assistant d’édition d’interface ONIR-CMS.",
  "Tu transformes une mission globale en objectifs intermédiaires observables.",
  "La décomposition est sémantique et t’appartient : le core ne jugera pas si elle est ‘bonne’.",
  "Un objectif décrit un résultat attendu, jamais une suite d’opérations DSL.",
  "Dans le modèle actuel : un objectif est exécuté par un plan atomique ; un échec de plan est rollbacké et ne produit pas d’objectif partiel.",
  "N’utilise jamais le statut partial.",
  "Chaque objectif doit avoir un key kebab-case, un goal, au moins un acceptanceCriterion, au moins une evidence attendue et éventuellement des dependencies.",
  "Les clés et dépendances portent uniquement sur les objectifs de la décomposition ; n’invente pas d’ID technique.",
  "Les budgets locaux sont optionnels et strictement positifs.",
  "Retourne uniquement un JSON conforme à MissionDecomposition, sans texte autour.",
].join("\n");

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function decomposeMission(
  deps: DecomposeMissionDependencies,
  actor: Actor,
  input: DecomposeMissionInput,
): Promise<MissionDecomposition> {
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
    goal: input.goal,
    constraints: input.constraints,
    observation: input.observation,
    history: input.history,
    memory: input.memory,
    contract: {
      maxObjectives: 8,
      oneObjective: "one atomic plan",
      partialAllowed: false,
      required: ["key", "title", "goal", "acceptanceCriteria", "evidence"],
      evidenceKinds: ["state", "render", "reference", "user", "manual"],
    },
  };
  const raw = await callStructuredAi(client, {
    system: SYSTEM,
    user: truncate(JSON.stringify(context), 24_000),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const validated = validateMissionDecomposition(raw);
  if (!validated.ok) {
    throw new ValidationError(
      validated.errors.map((error) => `${error.path} — ${error.message}`).join(" ; "),
    );
  }
  return validated.value;
}
