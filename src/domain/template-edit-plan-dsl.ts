/** Plan DSL v1 : contrat stable entre le planner IA et le compilateur (ADR-0112). */

export const PLAN_DSL_VERSION = 1;
export const PLAN_DSL_MAX_STEPS = 20;

export type PlanDslReference = { $candidate: string } | { $ref: string };

export type PlanDslValue =
  | string
  | number
  | boolean
  | null
  | PlanDslReference
  | PlanDslValue[]
  | { [key: string]: PlanDslValue };

export type PlanDslSetTarget = { kind: "param"; path: string };

export type PlanDslOperation =
  | { op: "set"; target: PlanDslSetTarget; value: PlanDslValue }
  | { op: "set"; candidateId: string; field: string; value: PlanDslValue }
  | {
      op: "insert";
      target: { kind: "collection"; collection: string };
      values: Record<string, PlanDslValue>;
    }
  | {
      op: "insertChild";
      parent: string | PlanDslReference;
      child: {
        collection: string;
        kind: string;
        slot: string;
        values: Record<string, PlanDslValue>;
      };
    }
  | { op: "remove"; candidateId: string }
  | { op: "duplicate"; candidateId: string }
  | {
      op: "move";
      candidateId: string;
      parent: string | PlanDslReference;
      position: number;
    };

export type PlanDslStep = {
  id: string;
  description?: string;
  operation: PlanDslOperation;
};

export type PlanDslIntent = "create" | "reuse" | "update" | "noop";

export type PlanDslV1 = {
  schemaVersion: typeof PLAN_DSL_VERSION;
  intent?: PlanDslIntent;
  baseHash?: string;
  steps: PlanDslStep[];
  warnings?: string[];
  clarification?: string | null;
};

export type PlanDslErrorCode =
  | "INVALID_PLAN"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_STEP_ID"
  | "DUPLICATE_STEP_ID"
  | "INVALID_OPERATION"
  | "INVALID_TARGET_KIND"
  | "MISSING_REQUIRED_PROPERTY"
  | "INVALID_CANDIDATE_ID"
  | "INVALID_COLLECTION"
  | "INVALID_FIELD"
  | "INVALID_VALUE"
  | "INVALID_REFERENCE"
  | "INVALID_REFERENCE_TYPE"
  | "UNKNOWN_REF"
  | "INVALID_REF_ORDER"
  | "STEPS_AND_CLARIFICATION_CONFLICT"
  | "EMPTY_PLAN_WITHOUT_CLARIFICATION"
  | "TOO_MANY_STEPS";

export type PlanDslError = {
  code: PlanDslErrorCode;
  stepId?: string;
  path: string;
  expected?: string;
  received?: string;
  message: string;
};

export type PlanDslValidationResult =
  | { ok: true; value: PlanDslV1 }
  | { ok: false; errors: PlanDslError[] };

const STEP_ID = /^[a-z][a-z0-9-]*$/;
const CANDIDATE_ID = /^[a-z][a-z0-9_-]*:[A-Za-z0-9._:-]+$/;
const ALLOWED_INTENTS = new Set<PlanDslIntent>(["create", "reuse", "update", "noop"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isReference(value: unknown): value is PlanDslReference {
  return (
    isRecord(value) &&
    ((typeof value.$candidate === "string" && Object.keys(value).length === 1) ||
      (typeof value.$ref === "string" && Object.keys(value).length === 1))
  );
}

function collectRefs(value: unknown, path: string, errors: PlanDslError[]): void {
  if (isReference(value)) {
    const ref = "$candidate" in value ? value.$candidate : value.$ref;
    if (ref.trim() === "") {
      errors.push({
        code: "INVALID_REFERENCE",
        path,
        expected: "identifiant non vide",
        message: "Une référence vide est invalide.",
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      collectRefs(entry, `${path}[${index}]`, errors);
    }
    return;
  }
  if (isRecord(value)) {
    if ("$candidate" in value || "$ref" in value) {
      errors.push({
        code: "INVALID_REFERENCE",
        path,
        expected: "objet de référence unique",
        message: "Une référence ne peut pas contenir d’autres propriétés.",
      });
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      collectRefs(entry, `${path}.${key}`, errors);
    }
  }
}

function refsFor(value: unknown): string[] {
  if (isReference(value)) return "$ref" in value ? [value.$ref] : [];
  if (Array.isArray(value)) return value.flatMap(refsFor);
  if (isRecord(value)) return Object.values(value).flatMap(refsFor);
  return [];
}

function validateOperation(
  raw: unknown,
  stepId: string,
  path: string,
  previousSteps: Set<string>,
  errors: PlanDslError[],
): PlanDslOperation | null {
  if (!isRecord(raw)) {
    errors.push({
      code: "INVALID_OPERATION",
      stepId,
      path,
      expected: "objet",
      received: valueType(raw),
      message: "Opération objet attendue.",
    });
    return null;
  }
  const op = text(raw.op);
  const fail = (
    code: PlanDslErrorCode,
    field: string,
    message: string,
    expected?: string,
  ): null => {
    errors.push({
      code,
      stepId,
      path: `${path}.${field}`,
      ...(expected === undefined ? {} : { expected }),
      received: valueType(raw[field]),
      message,
    });
    return null;
  };
  const checkRefs = (value: unknown, refPath: string): boolean => {
    collectRefs(value, refPath, errors);
    for (const ref of refsFor(value)) {
      if (!previousSteps.has(ref)) {
        errors.push({
          code: previousSteps.has(ref) ? "UNKNOWN_REF" : "INVALID_REF_ORDER",
          stepId,
          path: refPath,
          expected: "étape précédente",
          received: ref,
          message: `La référence $ref:${ref} doit pointer vers une étape précédente.`,
        });
        return false;
      }
    }
    return true;
  };

  if (op === "set") {
    if (raw.target !== undefined) {
      if (!isRecord(raw.target)) {
        errors.push({
          code: "INVALID_TARGET_KIND",
          stepId,
          path: `${path}.target`,
          expected: "objet structuré",
          received: valueType(raw.target),
          message: "Une opération set exige une cible structurée.",
        });
        return null;
      }
      if (text(raw.target.kind) !== "param") {
        errors.push({
          code: "INVALID_TARGET_KIND",
          stepId,
          path: `${path}.target.kind`,
          expected: "param",
          received: valueType(raw.target.kind),
          message: "Une cible target de set doit être de kind param.",
        });
        return null;
      }
      const paramPath = text(raw.target.path);
      if (paramPath === "")
        return fail("MISSING_REQUIRED_PROPERTY", "target.path", "path est requis.");
      if (!("value" in raw)) {
        errors.push({
          code: "MISSING_REQUIRED_PROPERTY",
          stepId,
          path: `${path}.value`,
          expected: "valeur",
          message: "La propriété value est obligatoire pour set.",
        });
        return null;
      }
      if (!checkRefs(raw.value, `${path}.value`)) return null;
      return {
        op: "set",
        target: { kind: "param", path: paramPath },
        value: raw.value as PlanDslValue,
      };
    }
    const candidateId = text(raw.candidateId);
    const field = text(raw.field);
    if (!CANDIDATE_ID.test(candidateId)) {
      return fail(
        "INVALID_CANDIDATE_ID",
        "candidateId",
        "candidateId invalide.",
        "collection:itemId",
      );
    }
    if (field === "") return fail("MISSING_REQUIRED_PROPERTY", "field", "field est requis.");
    if (!("value" in raw)) {
      errors.push({
        code: "MISSING_REQUIRED_PROPERTY",
        stepId,
        path: `${path}.value`,
        expected: "valeur",
        message: "La propriété value est obligatoire pour set.",
      });
      return null;
    }
    if (!checkRefs(raw.value, `${path}.value`)) return null;
    return { op: "set", candidateId, field, value: raw.value as PlanDslValue };
  }

  if (op === "insert") {
    const target = raw.target;
    if (!isRecord(target) || text(target.kind) !== "collection") {
      return fail(
        "INVALID_OPERATION",
        "target",
        "insert exige target.kind=collection.",
        "collection",
      );
    }
    const collection = text(target.collection);
    if (collection === "")
      return fail("INVALID_COLLECTION", "target.collection", "collection requise.");
    if (!isRecord(raw.values))
      return fail("MISSING_REQUIRED_PROPERTY", "values", "values requis.", "objet");
    if (!checkRefs(raw.values, `${path}.values`)) return null;
    return {
      op: "insert",
      target: { kind: "collection", collection },
      values: raw.values as Record<string, PlanDslValue>,
    };
  }

  if (op === "insertChild") {
    const parent = raw.parent;
    if (typeof parent !== "string" && !isReference(parent)) {
      return fail(
        "INVALID_REFERENCE",
        "parent",
        "parent doit être un candidateId ou une référence.",
      );
    }
    if (typeof parent === "string" && !CANDIDATE_ID.test(parent)) {
      return fail("INVALID_CANDIDATE_ID", "parent", "candidateId invalide.");
    }
    if (isReference(parent)) {
      if ("$ref" in parent && !previousSteps.has(parent.$ref)) {
        return fail("INVALID_REF_ORDER", "parent", "Référence vers une étape future.");
      }
      collectRefs(parent, `${path}.parent`, errors);
    }
    const child = raw.child;
    if (!isRecord(child))
      return fail("MISSING_REQUIRED_PROPERTY", "child", "child requis.", "objet");
    const collection = text(child.collection);
    const kind = text(child.kind);
    const slot = text(child.slot);
    if (collection === "")
      return fail("INVALID_COLLECTION", "child.collection", "collection requise.");
    if (kind === "") return fail("MISSING_REQUIRED_PROPERTY", "child.kind", "kind requis.");
    if (slot === "") return fail("MISSING_REQUIRED_PROPERTY", "child.slot", "slot requis.");
    if (!isRecord(child.values))
      return fail("MISSING_REQUIRED_PROPERTY", "child.values", "values requis.", "objet");
    if (!checkRefs(child.values, `${path}.child.values`)) return null;
    return {
      op: "insertChild",
      parent,
      child: {
        collection,
        kind,
        slot,
        values: child.values as Record<string, PlanDslValue>,
      },
    };
  }

  if (op === "remove" || op === "duplicate") {
    const candidateId = text(raw.candidateId);
    if (!CANDIDATE_ID.test(candidateId)) {
      return fail("INVALID_CANDIDATE_ID", "candidateId", "candidateId invalide.");
    }
    return { op, candidateId };
  }

  if (op === "move") {
    const candidateId = text(raw.candidateId);
    if (!CANDIDATE_ID.test(candidateId)) {
      return fail("INVALID_CANDIDATE_ID", "candidateId", "candidateId invalide.");
    }
    const parent = raw.parent;
    if (typeof parent !== "string" && !isReference(parent)) {
      return fail(
        "INVALID_REFERENCE",
        "parent",
        "parent doit être un candidateId ou une référence.",
      );
    }
    if (isReference(parent)) {
      if ("$ref" in parent && !previousSteps.has(parent.$ref)) {
        return fail("INVALID_REF_ORDER", "parent", "Référence vers une étape future.");
      }
      collectRefs(parent, `${path}.parent`, errors);
    }
    if (!Number.isInteger(raw.position) || (raw.position as number) < 0) {
      return fail("INVALID_VALUE", "position", "position entière positive requise.", "entier >= 0");
    }
    return { op: "move", candidateId, parent, position: raw.position as number };
  }

  return fail(
    "INVALID_OPERATION",
    "op",
    "opération inconnue.",
    "set|insert|insertChild|remove|duplicate|move",
  );
}

export function validatePlanDsl(input: unknown): PlanDslValidationResult {
  const errors: PlanDslError[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        { code: "INVALID_PLAN", path: "plan", expected: "objet", message: "Plan objet attendu." },
      ],
    };
  }
  if (input.schemaVersion !== PLAN_DSL_VERSION) {
    errors.push({
      code: "UNSUPPORTED_SCHEMA_VERSION",
      path: "schemaVersion",
      expected: String(PLAN_DSL_VERSION),
      received: String(input.schemaVersion),
      message: "Version de Plan DSL non supportée.",
    });
  }
  if (input.intent !== undefined && !ALLOWED_INTENTS.has(input.intent as PlanDslIntent)) {
    errors.push({
      code: "INVALID_VALUE",
      path: "intent",
      expected: "create|reuse|update|noop",
      received: valueType(input.intent),
      message: "Intent inconnu.",
    });
  }
  const stepsRaw = input.steps;
  if (!Array.isArray(stepsRaw)) {
    errors.push({
      code: "INVALID_PLAN",
      path: "steps",
      expected: "array",
      received: valueType(stepsRaw),
      message: "steps doit être un tableau.",
    });
    return { ok: false, errors };
  }
  if (stepsRaw.length > PLAN_DSL_MAX_STEPS) {
    errors.push({
      code: "TOO_MANY_STEPS",
      path: "steps",
      expected: `<= ${PLAN_DSL_MAX_STEPS}`,
      received: String(stepsRaw.length),
      message: `Maximum ${PLAN_DSL_MAX_STEPS} étapes.`,
    });
  }
  if (stepsRaw.length > 0 && text(input.clarification) !== "") {
    errors.push({
      code: "STEPS_AND_CLARIFICATION_CONFLICT",
      path: "clarification",
      message: "Un plan ne peut pas avoir des steps et une clarification.",
    });
  }
  if (stepsRaw.length === 0 && text(input.clarification) === "" && !Array.isArray(input.warnings)) {
    errors.push({
      code: "EMPTY_PLAN_WITHOUT_CLARIFICATION",
      path: "steps",
      message: "Un plan vide doit fournir une clarification ou un warning.",
    });
  }

  const steps: PlanDslStep[] = [];
  const seen = new Set<string>();
  const previous = new Set<string>();
  stepsRaw.forEach((raw, index) => {
    if (!isRecord(raw)) {
      errors.push({
        code: "INVALID_OPERATION",
        path: `steps[${index}]`,
        expected: "objet",
        received: valueType(raw),
        message: "Step objet attendu.",
      });
      return;
    }
    const id = text(raw.id);
    if (!STEP_ID.test(id)) {
      errors.push({
        code: "INVALID_STEP_ID",
        path: `steps[${index}].id`,
        expected: "kebab-case",
        received: id,
        message: "Step id invalide.",
      });
      return;
    }
    if (seen.has(id)) {
      errors.push({
        code: "DUPLICATE_STEP_ID",
        stepId: id,
        path: `steps[${index}].id`,
        message: "Step id dupliqué.",
      });
      return;
    }
    seen.add(id);
    const operation = validateOperation(
      raw.operation,
      id,
      `steps[${index}].operation`,
      new Set(previous),
      errors,
    );
    if (operation !== null) {
      steps.push({
        id,
        ...(text(raw.description) === "" ? {} : { description: text(raw.description) }),
        operation,
      });
    }
    previous.add(id);
  });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: PLAN_DSL_VERSION,
      ...(input.intent === undefined ? {} : { intent: input.intent as PlanDslIntent }),
      ...(text(input.baseHash) === "" ? {} : { baseHash: text(input.baseHash) }),
      steps,
      ...(Array.isArray(input.warnings)
        ? { warnings: input.warnings.filter((entry): entry is string => typeof entry === "string") }
        : {}),
      ...(text(input.clarification) === "" ? {} : { clarification: text(input.clarification) }),
    },
  };
}
