import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import type { TemplateEditPlan } from "@/domain/template-edit-plan";
import { executeTemplateEditPlan } from "@/domain/template-edit-plan";
import { compileTemplateEditPlan } from "@/domain/template-edit-plan-compiler";
import type { TemplateEditProposal } from "@/domain/template-edit-proposal";
import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";
import type { TemplateAiSkillV1 } from "@/domain/template-skill";
import type { TemplateCapabilityMap } from "./template-capabilities";
import { emitTemplateEditEvent, type TemplateEditEventSink } from "./template-edit-events";
import type { TemplateEditHistoryMessage } from "./template-edit-history";
import { buildTemplateEditPlanPrompt } from "./template-edit-plan-prompt";

const MAX_ATTEMPTS = 10;

export type PlanTemplateEditInput = {
  request: string;
  page: TemplateEditPageContext | null;
  candidates: TemplateEditCandidate[];
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  skills: TemplateAiSkillV1[];
  capabilities?: TemplateCapabilityMap;
  history?: TemplateEditHistoryMessage[];
  signal?: AbortSignal;
  onEvent?: TemplateEditEventSink;
  maxAttempts?: number;
  previousPlan?: unknown;
  previousErrors?: string[];
  observation?: unknown;
  lastAttempt?: unknown;
  planOnly?: boolean;
  providerId?: string;
  model?: string;
};

export type PlanTemplateEditDependencies = { aiFactory: AiClientFactory };

export type PlanAttemptRecord = {
  attempt: number;
  status: "success" | "error" | "clarification" | "noop";
  errors: string[];
  rawPlan: unknown;
};

export type PlanTemplateEditResult =
  | {
      status: "proposed";
      values: TemplateParamValues;
      proposal: TemplateEditProposal;
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
      attemptHistory: PlanAttemptRecord[];
    }
  | {
      status: "noop";
      message: string;
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
      attemptHistory: PlanAttemptRecord[];
    }
  | {
      status: "clarification";
      message: string;
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
      attemptHistory: PlanAttemptRecord[];
    }
  | {
      status: "rejected";
      errors: string[];
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
      attemptHistory: PlanAttemptRecord[];
    }
  | {
      status: "planned";
      plan: TemplateEditPlan;
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
      attemptHistory: PlanAttemptRecord[];
    };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveProviderInput(input: PlanTemplateEditInput): {
  provider: string | null;
  model: string | null;
} {
  const provider = text(input.providerId);
  const model = text(input.model);
  if ((provider === "") !== (model === "")) {
    throw new ValidationError("Choisissez à la fois le fournisseur et le modèle IA");
  }
  return { provider: provider === "" ? null : provider, model: model === "" ? null : model };
}

/** Planifie, exécute et retente une édition. Aucune écriture en base. */
export async function planTemplateEdit(
  deps: PlanTemplateEditDependencies,
  actor: Actor,
  input: PlanTemplateEditInput,
): Promise<PlanTemplateEditResult> {
  assertCan(actor, "links:update");
  assertCan(actor, "ai:read");
  const organizationId = organizationOf(actor);
  const maxAttempts = Math.min(Math.max(input.maxAttempts ?? MAX_ATTEMPTS, 1), MAX_ATTEMPTS);
  const { provider, model } = resolveProviderInput(input);
  const target =
    provider !== null && model !== null
      ? { organizationId, aiProviderId: provider, aiModel: model }
      : { organizationId, aiProviderId: null, aiModel: null };

  let resolved: ResolvedAiTarget;
  if (provider !== null && model !== null) {
    resolved = await deps.aiFactory.resolve(target);
  } else if (deps.aiFactory.resolveForUsage !== undefined) {
    resolved = await deps.aiFactory.resolveForUsage(target, "assistant");
  } else {
    resolved = await deps.aiFactory.resolve(target);
  }
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

  let previousErrors: string[] = input.previousErrors ?? [];
  let previousPlan: unknown = input.previousPlan ?? null;
  let lastRaw: unknown = null;
  let lastWarnings: string[] = [];
  const attemptHistory: PlanAttemptRecord[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStarted = Date.now();
    emitTemplateEditEvent(input.onEvent, {
      stage: "planning",
      status: "running",
      title: `Tentative de plan ${attempt}/${maxAttempts}`,
      attempt,
      maxAttempts,
      startedAt: new Date(attemptStarted).toISOString(),
    });
    const prompt = buildTemplateEditPlanPrompt({
      request: input.request,
      page: input.page,
      candidates: input.candidates,
      editor: input.editor,
      schema: input.schema,
      values: input.values,
      skills: input.skills,
      ...(input.observation === undefined ? {} : { observation: input.observation }),
      ...(input.lastAttempt === undefined ? {} : { lastAttempt: input.lastAttempt }),
      ...(input.capabilities === undefined ? {} : { capabilities: input.capabilities }),
      ...(input.history === undefined ? {} : { history: input.history }),
      ...(previousErrors.length === 0 ? {} : { previousErrors, previousPlan }),
    });
    const raw = await callStructuredAi(client, {
      ...prompt,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    lastRaw = raw;
    emitTemplateEditEvent(input.onEvent, {
      stage: "planner_response",
      status: "success",
      title: "Plan brut reçu",
      attempt,
      maxAttempts,
      detail: raw,
      startedAt: new Date(attemptStarted).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - attemptStarted,
    });
    const compiled = compileTemplateEditPlan({
      plan: raw,
      editor: input.editor,
      schema: input.schema,
      candidates: input.candidates,
    });
    if (!compiled.ok) {
      previousErrors = compiled.errors.map(
        (error) => `${error.code} ${error.path} : ${error.message}`,
      );
      emitTemplateEditEvent(input.onEvent, {
        stage: "compilation",
        status: "error",
        title: "Plan refusé par le compilateur",
        summary: previousErrors.join(" ; "),
        attempt,
        maxAttempts,
        detail: compiled.errors,
        startedAt: new Date(attemptStarted).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - attemptStarted,
      });
      attemptHistory.push({
        attempt,
        status: "error",
        errors: previousErrors,
        rawPlan: raw,
      });
      previousPlan = raw;
      continue;
    }
    const plan = compiled.value.plan;
    lastWarnings = plan.warnings ?? [];
    if (plan.steps.length === 0 && compiled.value.intent === "noop") {
      const message = plan.clarification ?? (plan.warnings ?? []).join(" ");
      return {
        status: "noop",
        message: message === "" ? "Aucune modification n’est nécessaire." : message,
        warnings: plan.warnings ?? [],
        rawPlan: raw,
        attempts: attempt,
        attemptHistory: [...attemptHistory, { attempt, status: "noop", errors: [], rawPlan: raw }],
      };
    }
    if (plan.steps.length === 0) {
      const message = plan.clarification ?? (plan.warnings ?? []).join(" ");
      if (message !== "") {
        return {
          status: "clarification",
          message,
          warnings: plan.warnings ?? [],
          rawPlan: raw,
          attempts: attempt,
          attemptHistory: [
            ...attemptHistory,
            { attempt, status: "clarification", errors: [], rawPlan: raw },
          ],
        };
      }
      return {
        status: "rejected",
        errors: ["plan vide sans clarification"],
        warnings: [],
        rawPlan: raw,
        attempts: attempt,
        attemptHistory: [
          ...attemptHistory,
          { attempt, status: "error", errors: ["plan vide sans clarification"], rawPlan: raw },
        ],
      };
    }

    if (input.planOnly === true) {
      return {
        status: "planned",
        plan,
        warnings: plan.warnings ?? [],
        rawPlan: raw,
        attempts: attempt,
        attemptHistory: [
          ...attemptHistory,
          { attempt, status: "success", errors: [], rawPlan: raw },
        ],
      };
    }

    const execution = executeTemplateEditPlan({
      editor: input.editor,
      schema: input.schema,
      values: input.values,
      plan,
      onStep: (step) => {
        emitTemplateEditEvent(input.onEvent, {
          stage: "execution",
          status: step.status,
          title: step.label,
          ...(step.summary === undefined ? {} : { summary: step.summary }),
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          detail: step.detail,
          startedAt: new Date(step.startedAt).toISOString(),
          endedAt: new Date(step.endedAt).toISOString(),
          durationMs: step.durationMs,
        });
      },
    });
    if (execution.ok) {
      emitTemplateEditEvent(input.onEvent, {
        stage: "planning",
        status: "success",
        title: "Plan validé",
        attempt,
        maxAttempts,
        summary: `${execution.proposal.operations.length} opération(s) simulée(s)`,
        startedAt: new Date(attemptStarted).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - attemptStarted,
      });
      return {
        status: "proposed",
        values: execution.values,
        proposal: execution.proposal,
        warnings: execution.warnings,
        rawPlan: raw,
        attempts: attempt,
        attemptHistory: [
          ...attemptHistory,
          { attempt, status: "success", errors: [], rawPlan: raw },
        ],
      };
    }

    previousPlan = raw;
    previousErrors = execution.errors.map((error) => `${execution.stepId ?? "plan"} : ${error}`);
  }

  return {
    status: "rejected",
    errors: previousErrors,
    warnings: lastWarnings,
    rawPlan: lastRaw,
    attempts: maxAttempts,
    attemptHistory,
  };
}
