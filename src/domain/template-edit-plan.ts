import type {
  ProposalTarget,
  TemplateEditOperation,
  TemplateEditProposal,
} from "@/domain/template-edit-proposal";
import { applyTemplateEditProposal } from "@/domain/template-edit-proposal";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type {
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "@/domain/template-params";

export type TemplateEditPlanStep = {
  id: string;
  description?: string;
  operation: TemplateEditOperation;
};

export type TemplateEditPlan = {
  steps: TemplateEditPlanStep[];
  warnings?: string[];
  clarification?: string | null;
};

export type TemplateEditPlanSuccess = {
  ok: true;
  values: TemplateParamValues;
  refs: Record<string, string>;
  proposal: TemplateEditProposal;
  warnings: string[];
};

export type TemplateEditPlanFailure = {
  ok: false;
  stepId: string | null;
  errors: string[];
  values: TemplateParamValues;
  refs: Record<string, string>;
  proposal: TemplateEditProposal | null;
};

export type TemplateEditPlanExecution = TemplateEditPlanSuccess | TemplateEditPlanFailure;

export type TemplateEditPlanStepEvent = {
  stepId: string;
  label: string;
  status: "running" | "success" | "error";
  summary?: string;
  detail?: unknown;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

const REF = /^\$ref:([a-z][a-z0-9-]*)$/i;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveString(value: string, refs: Record<string, string>): string {
  const match = REF.exec(value);
  if (match === null) return value;
  const id = match[1];
  const resolved = id === undefined ? undefined : refs[id];
  if (resolved === undefined) {
    throw new Error(`Référence de plan inconnue : ${value}`);
  }
  return resolved;
}

function resolveValue(value: TemplateParamValue, refs: Record<string, string>): TemplateParamValue {
  if (typeof value === "string") return resolveString(value, refs);
  if (Array.isArray(value)) return value.map((entry) => resolveValue(entry, refs));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveValue(entry, refs)]),
    );
  }
  return value;
}

function resolveTarget(target: ProposalTarget, refs: Record<string, string>): ProposalTarget {
  if (target.kind === "param") return target;
  if (target.kind === "collectionItemField") {
    return {
      ...target,
      itemId: resolveString(target.itemId, refs),
    };
  }
  return { ...target, itemId: resolveString(target.itemId, refs) };
}

function resolveFieldTarget(
  target: Extract<ProposalTarget, { kind: "collectionItemField" }>,
  refs: Record<string, string>,
): Extract<ProposalTarget, { kind: "collectionItemField" }> {
  return { ...target, itemId: resolveString(target.itemId, refs) };
}

function resolveOperation(
  operation: TemplateEditOperation,
  refs: Record<string, string>,
): TemplateEditOperation {
  if (operation.op === "set") {
    return {
      ...operation,
      target: resolveTarget(operation.target, refs),
      value: resolveValue(operation.value, refs),
    };
  }
  if (operation.op === "insert") {
    return {
      ...operation,
      values: Object.fromEntries(
        Object.entries(operation.values).map(([key, value]) => [key, resolveValue(value, refs)]),
      ),
      ...(operation.bindTo === undefined
        ? {}
        : { bindTo: { target: resolveFieldTarget(operation.bindTo.target, refs) } }),
    };
  }
  if (operation.op === "insertChild") {
    return {
      ...operation,
      parent: resolveTarget(operation.parent, refs),
      child: {
        ...operation.child,
        values: Object.fromEntries(
          Object.entries(operation.child.values).map(([key, value]) => [
            key,
            resolveValue(value, refs),
          ]),
        ),
      },
    };
  }
  if (operation.op === "move") {
    return {
      ...operation,
      target: resolveTarget(operation.target, refs),
      parent: resolveTarget(operation.parent, refs),
    };
  }
  return { ...operation, target: resolveTarget(operation.target, refs) };
}

export function executeTemplateEditPlan(input: {
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  plan: TemplateEditPlan;
  onStep?: (event: TemplateEditPlanStepEvent) => void;
}): TemplateEditPlanExecution {
  let values = clone(input.values);
  const refs: Record<string, string> = {};
  const resolvedOperations: TemplateEditOperation[] = [];
  const warnings = [...(input.plan.warnings ?? [])];
  const seen = new Set<string>();

  for (const step of input.plan.steps) {
    const startedAt = Date.now();
    const label = step.description ?? step.id;
    input.onStep?.({
      stepId: step.id,
      label,
      status: "running",
      summary: step.operation.op,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 0,
    });
    if (step.id === "" || seen.has(step.id)) {
      input.onStep?.({
        stepId: step.id,
        label,
        status: "error",
        summary: "step id vide ou dupliqué",
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      });
      return {
        ok: false,
        stepId: step.id || null,
        errors: ["Step id vide ou dupliqué"],
        values,
        refs,
        proposal: null,
      };
    }
    seen.add(step.id);
    try {
      const operation = resolveOperation(step.operation, refs);
      const result = applyTemplateEditProposal({
        editor: input.editor,
        schema: input.schema,
        values,
        proposal: { operations: [operation] },
      });
      if (!result.ok) {
        const errors = result.errors.map((error) => `${error.field} — ${error.message}`);
        input.onStep?.({
          stepId: step.id,
          label,
          status: "error",
          summary: errors.join(" ; "),
          detail: result.errors,
          startedAt: new Date(startedAt).toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        });
        return {
          ok: false,
          stepId: step.id,
          errors,
          values,
          refs,
          proposal: { operations: resolvedOperations },
        };
      }
      values = result.values;
      resolvedOperations.push(operation);
      const itemId = result.itemIds[0];
      if (
        itemId !== undefined &&
        operation.op !== "set" &&
        operation.op !== "remove" &&
        operation.op !== "move"
      ) {
        refs[step.id] = itemId;
      }
      warnings.push(...result.warnings);
      input.onStep?.({
        stepId: step.id,
        label,
        status: "success",
        summary: itemId === undefined ? operation.op : `${operation.op} → ${itemId}`,
        detail: { operation, itemId: itemId ?? null },
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur d’exécution du plan";
      input.onStep?.({
        stepId: step.id,
        label,
        status: "error",
        summary: message,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      });
      return {
        ok: false,
        stepId: step.id,
        errors: [message],
        values,
        refs,
        proposal: { operations: resolvedOperations },
      };
    }
  }

  return {
    ok: true,
    values,
    refs,
    proposal: { operations: resolvedOperations, warnings },
    warnings,
  };
}
