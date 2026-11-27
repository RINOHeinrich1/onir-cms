import type { TemplateEditPlan } from "@/domain/template-edit-plan";
import {
  type PlanDslError,
  type PlanDslOperation,
  type PlanDslReference,
  type PlanDslStep,
  type PlanDslV1,
  validatePlanDsl,
} from "@/domain/template-edit-plan-dsl";
import type { ProposalTarget, TemplateEditOperation } from "@/domain/template-edit-proposal";
import type { TemplateEditCandidate } from "@/domain/template-edit-target";
import type { TemplateEditorManifest, TemplateEditorReference } from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValue } from "@/domain/template-params";

export type CompiledTemplateEditPlan = {
  plan: TemplateEditPlan;
  intent: PlanDslV1["intent"] | undefined;
  baseHash: string | undefined;
};

export type CompileTemplateEditPlanInput = {
  plan: unknown;
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  candidates: TemplateEditCandidate[];
};

export type CompileTemplateEditPlanResult =
  | { ok: true; value: CompiledTemplateEditPlan }
  | { ok: false; errors: PlanDslError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function candidateKey(candidate: TemplateEditCandidate): string {
  return `${candidate.collection}:${candidate.itemId}`;
}

function collectionSchema(
  schema: TemplateParamSchema[],
  collection: string,
): TemplateParamSchema | null {
  return schema.find((entry) => entry.key === collection) ?? null;
}

function collectionFields(
  schema: TemplateParamSchema[],
  collection: string,
): TemplateParamSchema[] {
  const node = collectionSchema(schema, collection);
  return node?.items?.properties ?? [];
}

function referencesFor(
  editor: TemplateEditorManifest,
  collection: string,
  field: string,
): TemplateEditorReference | null {
  if (editor.version !== 2) return null;
  return (
    editor.references?.find(
      (reference) => reference.from === collection && reference.field === field,
    ) ?? null
  );
}

function referenceTargets(reference: TemplateEditorReference): string[] {
  if (reference.to !== undefined) return [reference.to];
  return Object.values(reference.targets ?? {});
}

function stepCollection(step: PlanDslStep): string | null {
  if (step.operation.op === "insert") return step.operation.target.collection;
  if (step.operation.op === "insertChild") return step.operation.child.collection;
  return null;
}

function error(
  code: PlanDslError["code"],
  path: string,
  message: string,
  options: { stepId?: string; expected?: string; received?: string } = {},
): PlanDslError {
  return {
    code,
    path,
    message,
    ...(options.stepId === undefined ? {} : { stepId: options.stepId }),
    ...(options.expected === undefined ? {} : { expected: options.expected }),
    ...(options.received === undefined ? {} : { received: options.received }),
  };
}

function compileReferenceValue(input: {
  value: PlanDslReference;
  path: string;
  stepId: string;
  expected: string[];
  candidates: Map<string, TemplateEditCandidate>;
  previousSteps: Map<string, PlanDslStep>;
  errors: PlanDslError[];
}): string | null {
  if ("$candidate" in input.value) {
    const candidate = input.candidates.get(input.value.$candidate);
    if (candidate === undefined) {
      input.errors.push(
        error("INVALID_CANDIDATE_ID", input.path, "Candidat inconnu.", {
          stepId: input.stepId,
          received: input.value.$candidate,
        }),
      );
      return null;
    }
    if (!input.expected.includes(candidate.collection)) {
      input.errors.push(
        error(
          "INVALID_REFERENCE_TYPE",
          input.path,
          "La référence ne cible pas la bonne collection.",
          {
            stepId: input.stepId,
            expected: input.expected.join(" | "),
            received: candidate.collection,
          },
        ),
      );
      return null;
    }
    return candidate.itemId;
  }

  if (!input.previousSteps.has(input.value.$ref)) {
    input.errors.push(
      error(
        "INVALID_REF_ORDER",
        input.path,
        "La référence doit pointer vers une étape précédente.",
        {
          stepId: input.stepId,
          received: input.value.$ref,
        },
      ),
    );
    return null;
  }
  const source = input.previousSteps.get(input.value.$ref);
  const collection = source === undefined ? null : stepCollection(source);
  if (collection === null || !input.expected.includes(collection)) {
    input.errors.push(
      error(
        "INVALID_REFERENCE_TYPE",
        input.path,
        "La référence créée ne cible pas la bonne collection.",
        {
          stepId: input.stepId,
          expected: input.expected.join(" | "),
          received: collection ?? "inconnue",
        },
      ),
    );
    return null;
  }
  return `$ref:${input.value.$ref}`;
}

function compileValue(input: {
  value: unknown;
  path: string;
  stepId: string;
  expected: string[];
  allowReference: boolean;
  candidates: Map<string, TemplateEditCandidate>;
  previousSteps: Map<string, PlanDslStep>;
  errors: PlanDslError[];
}): TemplateParamValue | undefined {
  if (isRecord(input.value) && ("$candidate" in input.value || "$ref" in input.value)) {
    if (!input.allowReference) {
      input.errors.push(
        error(
          "INVALID_REFERENCE_TYPE",
          input.path,
          "Une référence n’est pas autorisée dans ce champ.",
          {
            stepId: input.stepId,
          },
        ),
      );
      return undefined;
    }
    return (
      compileReferenceValue({
        value: input.value as PlanDslReference,
        path: input.path,
        stepId: input.stepId,
        expected: input.expected,
        candidates: input.candidates,
        previousSteps: input.previousSteps,
        errors: input.errors,
      }) ?? undefined
    );
  }
  if (input.allowReference && typeof input.value === "string") {
    input.errors.push(
      error(
        "INVALID_REFERENCE_TYPE",
        input.path,
        "Un champ de référence exige { $candidate } ou { $ref }.",
        { stepId: input.stepId, received: "string" },
      ),
    );
    return undefined;
  }
  if (Array.isArray(input.value)) {
    const values: TemplateParamValue[] = [];
    input.value.forEach((entry, index) => {
      const compiled = compileValue({
        ...input,
        value: entry,
        path: `${input.path}[${index}]`,
        allowReference: false,
        expected: [],
      });
      if (compiled !== undefined) values.push(compiled);
    });
    return values;
  }
  if (isRecord(input.value)) {
    const values: Record<string, TemplateParamValue> = {};
    for (const [key, entry] of Object.entries(input.value)) {
      const compiled = compileValue({
        ...input,
        value: entry,
        path: `${input.path}.${key}`,
        allowReference: false,
        expected: [],
      });
      if (compiled !== undefined) values[key] = compiled;
    }
    return values;
  }
  if (
    typeof input.value === "string" ||
    typeof input.value === "number" ||
    typeof input.value === "boolean" ||
    input.value === null
  ) {
    return input.value as TemplateParamValue;
  }
  input.errors.push(
    error("INVALID_VALUE", input.path, "Valeur non sérialisable.", { stepId: input.stepId }),
  );
  return undefined;
}

function compileSet(
  operation: Extract<PlanDslOperation, { op: "set" }>,
  step: PlanDslStep,
  input: CompileTemplateEditPlanInput,
  candidates: Map<string, TemplateEditCandidate>,
  previousSteps: Map<string, PlanDslStep>,
  errors: PlanDslError[],
): TemplateEditOperation | null {
  if ("target" in operation) {
    const value = compileValue({
      value: operation.value,
      path: `steps.${step.id}.value`,
      stepId: step.id,
      expected: [],
      allowReference: false,
      candidates,
      previousSteps,
      errors,
    });
    if (value === undefined) return null;
    return { op: "set", target: operation.target, value };
  }
  const candidate = candidates.get(operation.candidateId);
  if (candidate === undefined) {
    errors.push(
      error("INVALID_CANDIDATE_ID", `steps.${step.id}.candidateId`, "Candidat inconnu.", {
        stepId: step.id,
      }),
    );
    return null;
  }
  if (
    !collectionFields(input.schema, candidate.collection).some(
      (field) => field.key === operation.field,
    )
  ) {
    errors.push(
      error("INVALID_FIELD", `steps.${step.id}.field`, "Champ inconnu dans la collection.", {
        stepId: step.id,
      }),
    );
    return null;
  }
  const reference = referencesFor(input.editor, candidate.collection, operation.field);
  const expected = reference === null ? [] : referenceTargets(reference);
  const value = compileValue({
    value: operation.value,
    path: `steps.${step.id}.value`,
    stepId: step.id,
    expected,
    allowReference: reference !== null,
    candidates,
    previousSteps,
    errors,
  });
  if (value === undefined) return null;
  return {
    op: "set",
    target: {
      kind: "collectionItemField",
      collection: candidate.collection,
      itemKey: candidate.itemKey,
      itemId: candidate.itemId,
      field: operation.field,
    },
    value,
  };
}

function compileInsertValues(
  collection: string,
  values: Record<string, unknown>,
  step: PlanDslStep,
  input: CompileTemplateEditPlanInput,
  candidates: Map<string, TemplateEditCandidate>,
  previousSteps: Map<string, PlanDslStep>,
  errors: PlanDslError[],
): Record<string, TemplateParamValue> | null {
  const fields = collectionFields(input.schema, collection);
  const compiled: Record<string, TemplateParamValue> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.find((entry) => entry.key === key);
    if (field === undefined) {
      errors.push(
        error(
          "INVALID_FIELD",
          `steps.${step.id}.values.${key}`,
          "Champ inconnu dans la collection.",
          { stepId: step.id },
        ),
      );
      continue;
    }
    const reference = referencesFor(input.editor, collection, key);
    const c = compileValue({
      value,
      path: `steps.${step.id}.values.${key}`,
      stepId: step.id,
      expected: reference === null ? [] : referenceTargets(reference),
      allowReference: reference !== null,
      candidates,
      previousSteps,
      errors,
    });
    if (c !== undefined) compiled[key] = c;
  }
  return errors.some((entry) => entry.stepId === step.id) ? null : compiled;
}

function compileParentTarget(input: {
  value: unknown;
  path: string;
  step: PlanDslStep;
  candidates: Map<string, TemplateEditCandidate>;
  previousSteps: Map<string, PlanDslStep>;
  errors: PlanDslError[];
}): Extract<ProposalTarget, { kind: "collectionItem" }> | null {
  if (typeof input.value === "string") {
    const candidate = input.candidates.get(input.value);
    if (candidate === undefined) {
      input.errors.push(
        error("INVALID_CANDIDATE_ID", input.path, "Parent candidat inconnu.", {
          stepId: input.step.id,
        }),
      );
      return null;
    }
    return {
      kind: "collectionItem",
      collection: candidate.collection,
      itemKey: candidate.itemKey,
      itemId: candidate.itemId,
      ...(candidate.itemKind === undefined ? {} : { itemKind: candidate.itemKind }),
    };
  }
  if (isRecord(input.value) && "$ref" in input.value) {
    const ref = typeof input.value.$ref === "string" ? input.value.$ref : "";
    const source = input.previousSteps.get(ref);
    if (source === undefined) {
      input.errors.push(
        error("INVALID_REF_ORDER", input.path, "Référence parente vers une étape inconnue.", {
          stepId: input.step.id,
        }),
      );
      return null;
    }
    const collection = stepCollection(source);
    if (collection === null) {
      input.errors.push(
        error("INVALID_REFERENCE_TYPE", input.path, "L’étape parente ne crée pas d’élément.", {
          stepId: input.step.id,
        }),
      );
      return null;
    }
    const kind =
      source.operation.op === "insert" && typeof source.operation.values.kind === "string"
        ? source.operation.values.kind
        : undefined;
    return {
      kind: "collectionItem",
      collection,
      itemKey: "id",
      itemId: `$ref:${ref}`,
      ...(kind === undefined ? {} : { itemKind: kind }),
    };
  }
  input.errors.push(
    error("INVALID_REFERENCE", input.path, "Parent candidat ou $ref attendu.", {
      stepId: input.step.id,
    }),
  );
  return null;
}

function compileOperation(
  operation: PlanDslOperation,
  step: PlanDslStep,
  input: CompileTemplateEditPlanInput,
  candidates: Map<string, TemplateEditCandidate>,
  previousSteps: Map<string, PlanDslStep>,
  errors: PlanDslError[],
): TemplateEditOperation | null {
  if (operation.op === "set") {
    return compileSet(operation, step, input, candidates, previousSteps, errors);
  }
  if (operation.op === "insert") {
    const values = compileInsertValues(
      operation.target.collection,
      operation.values,
      step,
      input,
      candidates,
      previousSteps,
      errors,
    );
    return values === null ? null : { op: "insert", target: operation.target, values };
  }
  if (operation.op === "insertChild") {
    const parent = compileParentTarget({
      value: operation.parent,
      path: `steps.${step.id}.parent`,
      step,
      candidates,
      previousSteps,
      errors,
    });
    const values = compileInsertValues(
      operation.child.collection,
      operation.child.values,
      step,
      input,
      candidates,
      previousSteps,
      errors,
    );
    if (parent === null || values === null) return null;
    return {
      op: "insertChild",
      parent,
      child: {
        collection: operation.child.collection,
        kind: operation.child.kind,
        slot: operation.child.slot,
        values,
      },
    };
  }
  if (operation.op === "remove" || operation.op === "duplicate") {
    const candidate = candidates.get(operation.candidateId);
    if (candidate === undefined) {
      errors.push(
        error("INVALID_CANDIDATE_ID", `steps.${step.id}.candidateId`, "Candidat inconnu.", {
          stepId: step.id,
        }),
      );
      return null;
    }
    return {
      op: operation.op,
      target: {
        kind: "collectionItem",
        collection: candidate.collection,
        itemKey: candidate.itemKey,
        itemId: candidate.itemId,
      },
    };
  }
  const target = candidates.get(operation.candidateId);
  const parent = candidates.get(String(operation.parent));
  if (target === undefined || parent === undefined) {
    errors.push(
      error("INVALID_CANDIDATE_ID", `steps.${step.id}`, "Candidat move inconnu.", {
        stepId: step.id,
      }),
    );
    return null;
  }
  return {
    op: "move",
    target: {
      kind: "collectionItem",
      collection: target.collection,
      itemKey: target.itemKey,
      itemId: target.itemId,
    },
    parent: {
      kind: "collectionItem",
      collection: parent.collection,
      itemKey: parent.itemKey,
      itemId: parent.itemId,
      ...(parent.itemKind === undefined ? {} : { itemKind: parent.itemKind }),
    },
    position: operation.position,
  };
}

export function compileTemplateEditPlan(
  input: CompileTemplateEditPlanInput,
): CompileTemplateEditPlanResult {
  const validated = validatePlanDsl(input.plan);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const plan = validated.value;
  const candidates = new Map(
    input.candidates.map((candidate) => [candidateKey(candidate), candidate]),
  );
  const previousSteps = new Map<string, PlanDslStep>();
  const errors: PlanDslError[] = [];
  const steps: Array<{ id: string; description?: string; operation: TemplateEditOperation }> = [];

  for (const step of plan.steps) {
    const operation = compileOperation(
      step.operation,
      step,
      input,
      candidates,
      previousSteps,
      errors,
    );
    if (operation !== null) {
      steps.push({
        id: step.id,
        ...(step.description === undefined ? {} : { description: step.description }),
        operation,
      });
    }
    previousSteps.set(step.id, step);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      plan: {
        steps,
        ...(plan.warnings === undefined ? {} : { warnings: plan.warnings }),
        ...(plan.clarification === undefined ? {} : { clarification: plan.clarification }),
      },
      intent: plan.intent,
      baseHash: plan.baseHash,
    },
  };
}
