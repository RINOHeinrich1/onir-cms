import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import { executeTemplateEditPlan, type TemplateEditPlan } from "@/domain/template-edit-plan";
import type { TemplateEditProposal } from "@/domain/template-edit-proposal";
import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";
import type { TemplateAiSkillV1 } from "@/domain/template-skill";
import type { TemplateEditHistoryMessage } from "./template-edit-history";
import { buildTemplateEditPlanPrompt } from "./template-edit-plan-prompt";

const MAX_ATTEMPTS = 2;

export type PlanTemplateEditInput = {
  request: string;
  page: TemplateEditPageContext | null;
  candidates: TemplateEditCandidate[];
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  skills: TemplateAiSkillV1[];
  history?: TemplateEditHistoryMessage[];
  providerId?: string;
  model?: string;
};

export type PlanTemplateEditDependencies = { aiFactory: AiClientFactory };

export type PlanTemplateEditResult =
  | {
      status: "proposed";
      values: TemplateParamValues;
      proposal: TemplateEditProposal;
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
    }
  | {
      status: "clarification";
      message: string;
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
    }
  | {
      status: "rejected";
      errors: string[];
      warnings: string[];
      rawPlan: unknown;
      attempts: number;
    };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePlan(value: Record<string, unknown>): TemplateEditPlan | null {
  if (!Array.isArray(value.steps)) return null;
  const steps = value.steps.filter(isRecord).flatMap((step) => {
    const id = text(step.id);
    const operation = step.operation;
    if (id === "" || !isRecord(operation) || text(operation.op) === "") return [];
    return [
      {
        id,
        description: text(step.description),
        operation: operation as unknown as TemplateEditPlan["steps"][number]["operation"],
      },
    ];
  });
  if (steps.length !== value.steps.length) return null;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((entry): entry is string => typeof entry === "string")
    : [];
  const clarification = text(value.clarification);
  return {
    steps,
    warnings,
    ...(clarification === "" ? {} : { clarification }),
  };
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

  let previousErrors: string[] = [];
  let previousPlan: TemplateEditPlan | null = null;
  let lastRaw: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const prompt = buildTemplateEditPlanPrompt({
      request: input.request,
      page: input.page,
      candidates: input.candidates,
      editor: input.editor,
      schema: input.schema,
      values: input.values,
      skills: input.skills,
      ...(input.history === undefined ? {} : { history: input.history }),
      ...(previousErrors.length === 0 ? {} : { previousErrors, previousPlan }),
    });
    const raw = await callStructuredAi(client, prompt);
    lastRaw = raw;
    const plan = parsePlan(raw);
    if (plan === null) {
      previousErrors = ["plan JSON mal formé"];
      continue;
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
        };
      }
      return {
        status: "rejected",
        errors: ["plan vide sans clarification"],
        warnings: [],
        rawPlan: raw,
        attempts: attempt,
      };
    }

    const execution = executeTemplateEditPlan({
      editor: input.editor,
      schema: input.schema,
      values: input.values,
      plan,
    });
    if (execution.ok) {
      return {
        status: "proposed",
        values: execution.values,
        proposal: execution.proposal,
        warnings: execution.warnings,
        rawPlan: raw,
        attempts: attempt,
      };
    }

    previousPlan = plan;
    previousErrors = execution.errors.map((error) => `${execution.stepId ?? "plan"} : ${error}`);
  }

  return {
    status: "rejected",
    errors: previousErrors,
    warnings: previousPlan?.warnings ?? [],
    rawPlan: lastRaw,
    attempts: MAX_ATTEMPTS,
  };
}
