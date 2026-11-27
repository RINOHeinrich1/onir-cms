import type { TemplateEditOperation } from "@/domain/template-edit-proposal";
import type { TemplateParamValues } from "@/domain/template-params";
import type { AgentDeterministicVerification, AgentExecutionLog } from "./agent-loop";

type RecordValue = Record<string, unknown>;

function records(value: unknown): RecordValue[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is RecordValue =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function item(values: TemplateParamValues, collection: string, itemId: string): RecordValue | null {
  return records(values[collection]).find((entry) => entry.id === itemId) ?? null;
}

function targetItemId(target: unknown): string | null {
  if (target === null || typeof target !== "object") return null;
  const value = target as { kind?: unknown; itemId?: unknown };
  return value.kind === "param" || typeof value.itemId !== "string" ? null : value.itemId;
}

function targetCollection(target: unknown): string | null {
  if (target === null || typeof target !== "object") return null;
  const value = target as { kind?: unknown; collection?: unknown };
  return value.kind === "param" || typeof value.collection !== "string" ? null : value.collection;
}

function placementFor(values: TemplateParamValues, childId: string): RecordValue | null {
  return records(values.placements).find((entry) => entry.child_id === childId) ?? null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function operationOf(log: AgentExecutionLog): TemplateEditOperation | null {
  if (log.operation === null || typeof log.operation !== "object") return null;
  return log.operation as TemplateEditOperation;
}

/** Vérifie les postconditions structurelles de chaque étape exécutée. */
export function verifyAgentExecution(input: {
  before: TemplateParamValues;
  after: TemplateParamValues;
  logs: AgentExecutionLog[];
}): AgentDeterministicVerification {
  const checks = input.logs.map((log) => {
    const operation = operationOf(log);
    if (operation === null) {
      return {
        stepId: log.stepId,
        ok: log.status === "success",
        message:
          log.status === "success"
            ? `${log.stepId} exécutée.`
            : `${log.stepId} : opération illisible.`,
      };
    }

    if (operation.op === "set") {
      if (operation.target.kind !== "collectionItemField") {
        return {
          stepId: log.stepId,
          ok: log.status === "success",
          message: `${log.stepId} : set exécuté.`,
        };
      }
      const target = item(input.after, operation.target.collection, operation.target.itemId);
      const ok = target !== null && sameValue(target[operation.target.field], operation.value);
      return {
        stepId: log.stepId,
        ok,
        message: ok
          ? `${operation.target.collection}:${operation.target.itemId}.${operation.target.field} = valeur attendue.`
          : `${log.stepId} : la valeur attendue n’est pas présente après exécution.`,
      };
    }

    if (operation.op === "insert") {
      const created =
        log.itemId === null ? null : item(input.after, operation.target.collection, log.itemId);
      return {
        stepId: log.stepId,
        ok: created !== null,
        message:
          created === null
            ? `${log.stepId} : élément inséré introuvable.`
            : `${log.stepId} : élément inséré.`,
      };
    }

    if (operation.op === "insertChild") {
      const created =
        log.itemId === null ? null : item(input.after, operation.child.collection, log.itemId);
      const placement = log.itemId === null ? null : placementFor(input.after, log.itemId);
      const kind = created?.kind;
      const parentId = targetItemId(operation.parent);
      const ok =
        created !== null &&
        placement !== null &&
        kind === operation.child.kind &&
        parentId !== null &&
        placement.parent_id === parentId;
      return {
        stepId: log.stepId,
        ok,
        message: ok
          ? `${log.stepId} : enfant ${operation.child.kind} créé et placé.`
          : `${log.stepId} : enfant ou placement absent après insertion.`,
      };
    }

    if (operation.op === "unset") {
      if (operation.target.kind !== "collectionItemField") {
        return {
          stepId: log.stepId,
          ok: false,
          message: `${log.stepId} : cible unset invalide.`,
        };
      }
      const target = item(input.after, operation.target.collection, operation.target.itemId);
      const ok = target !== null && target[operation.target.field] === "";
      return {
        stepId: log.stepId,
        ok,
        message: ok
          ? `${operation.target.collection}:${operation.target.itemId}.${operation.target.field} est vide.`
          : `${log.stepId} : la référence n’a pas été vidée.`,
      };
    }

    if (operation.op === "remove") {
      const collection = targetCollection(operation.target);
      const itemId = targetItemId(operation.target);
      const stillThere =
        collection !== null && itemId !== null && item(input.after, collection, itemId) !== null;
      return {
        stepId: log.stepId,
        ok: !stillThere,
        message: stillThere
          ? `${log.stepId} : élément toujours présent après suppression.`
          : `${log.stepId} : élément supprimé.`,
      };
    }

    if (operation.op === "duplicate") {
      const collection = targetCollection(operation.target);
      const created =
        log.itemId === null || collection === null
          ? null
          : item(input.after, collection, log.itemId);
      return {
        stepId: log.stepId,
        ok: created !== null,
        message:
          created === null
            ? `${log.stepId} : duplication introuvable.`
            : `${log.stepId} : duplication présente.`,
      };
    }

    if (operation.op === "move") {
      const targetId = targetItemId(operation.target);
      const parentId = targetItemId(operation.parent);
      const placement = targetId === null ? null : placementFor(input.after, targetId);
      const ok =
        placement !== null &&
        parentId !== null &&
        placement.parent_id === parentId &&
        placement.position === operation.position;
      return {
        stepId: log.stepId,
        ok,
        message: ok
          ? `${log.stepId} : déplacement appliqué.`
          : `${log.stepId} : déplacement non appliqué.`,
      };
    }

    return {
      stepId: log.stepId,
      ok: log.status === "success",
      message: `${log.stepId} : étape exécutée.`,
    };
  });

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
