export type MissionEvidenceKind = "state" | "render" | "reference" | "user" | "manual";

export type MissionObjective = {
  key: string;
  title: string;
  goal: string;
  rationale?: string;
  acceptanceCriteria: string[];
  evidence: Array<{ kind: MissionEvidenceKind; description: string }>;
  dependencies: string[];
  constraints: string[];
  scope?: { paths?: string[]; collections?: string[]; kinds?: string[] };
  budget?: { maxPlans: number; maxAttempts: number; maxDurationMs?: number };
  priority?: number;
  supersedes?: string[];
};

export type MissionDecomposition = {
  schemaVersion: 1;
  reason: string;
  objectives: MissionObjective[];
};

export type MissionObjectiveStatus =
  | "pending"
  | "running"
  | "satisfied"
  | "accepted_with_gaps"
  | "blocked"
  | "failed"
  | "superseded";

export type MissionObjectiveState = {
  id: string;
  key: string;
  status: MissionObjectiveStatus;
  attempts: number;
  plans: number;
  revisionId?: string;
  stateHash?: string;
  evidence?: unknown[];
  lastError?: string;
  blockedReason?: string;
};

export type MissionProgress = {
  version: 1;
  goal: string;
  constraints: string[];
  objectives: MissionObjectiveState[];
  activeObjectiveId: string | null;
};

export type MissionValidationError = { path: string; message: string };
export type MissionValidationResult =
  | { ok: true; value: MissionDecomposition }
  | { ok: false; errors: MissionValidationError[] };

const MAX_OBJECTIVES = 8;
const MAX_CRITERIA = 8;
const MAX_EVIDENCE = 5;
const MAX_DEPENDENCIES = 8;
const MAX_CONSTRAINTS = 12;
const KEY_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result = value.map(text);
  return result.every((entry) => entry !== "") ? result : null;
}

/**
 * Valide le CONTRAT de décomposition.
 * Ne juge jamais la pertinence sémantique des objectifs.
 */
export function validateMissionDecomposition(
  raw: unknown,
  knownKeys: string[] = [],
): MissionValidationResult {
  const errors: MissionValidationError[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: "", message: "Objet de décomposition attendu." }] };
  }
  if (raw.schemaVersion !== 1) {
    errors.push({ path: "schemaVersion", message: "schemaVersion 1 attendu." });
  }
  const reason = text(raw.reason);
  if (reason === "") errors.push({ path: "reason", message: "reason requis." });
  if (!Array.isArray(raw.objectives)) {
    errors.push({ path: "objectives", message: "Liste objectives attendue." });
    return { ok: false, errors };
  }
  if (raw.objectives.length === 0 || raw.objectives.length > MAX_OBJECTIVES) {
    errors.push({
      path: "objectives",
      message: `Entre 1 et ${MAX_OBJECTIVES} objectifs attendus.`,
    });
  }

  const objectives: MissionObjective[] = [];
  const keys = new Set(knownKeys);
  const newKeys = new Set<string>();
  for (const [index, entry] of raw.objectives.entries()) {
    const path = `objectives[${index}]`;
    if (!isRecord(entry)) {
      errors.push({ path, message: "Objectif attendu." });
      continue;
    }
    const key = text(entry.key);
    if (!KEY_PATTERN.test(key)) {
      errors.push({ path: `${path}.key`, message: "key kebab-case invalide." });
    } else if (keys.has(key)) {
      errors.push({ path: `${path}.key`, message: "key dupliquée." });
    } else {
      keys.add(key);
      newKeys.add(key);
    }
    const title = text(entry.title);
    const goal = text(entry.goal);
    if (title === "") errors.push({ path: `${path}.title`, message: "title requis." });
    if (goal === "") errors.push({ path: `${path}.goal`, message: "goal requis." });

    const criteria = strings(entry.acceptanceCriteria);
    if (criteria === null || criteria.length === 0 || criteria.length > MAX_CRITERIA) {
      errors.push({
        path: `${path}.acceptanceCriteria`,
        message: `Entre 1 et ${MAX_CRITERIA} critères attendus.`,
      });
    }

    const evidenceRaw = Array.isArray(entry.evidence) ? entry.evidence : [];
    const evidence: MissionObjective["evidence"] = [];
    if (evidenceRaw.length === 0 || evidenceRaw.length > MAX_EVIDENCE) {
      errors.push({
        path: `${path}.evidence`,
        message: `Entre 1 et ${MAX_EVIDENCE} preuves attendues.`,
      });
    }
    for (const [evidenceIndex, evidenceEntry] of evidenceRaw.entries()) {
      const evidencePath = `${path}.evidence[${evidenceIndex}]`;
      if (!isRecord(evidenceEntry)) {
        errors.push({ path: evidencePath, message: "Preuve attendue." });
        continue;
      }
      const kind = text(evidenceEntry.kind);
      const description = text(evidenceEntry.description);
      if (!["state", "render", "reference", "user", "manual"].includes(kind)) {
        errors.push({ path: `${evidencePath}.kind`, message: "kind de preuve invalide." });
      }
      if (description === "") {
        errors.push({ path: `${evidencePath}.description`, message: "description requise." });
      }
      if (kind !== "" && description !== "") {
        evidence.push({ kind: kind as MissionEvidenceKind, description });
      }
    }

    const dependencies = strings(entry.dependencies) ?? [];
    if (dependencies.length > MAX_DEPENDENCIES) {
      errors.push({ path: `${path}.dependencies`, message: "Trop de dépendances." });
    }
    const constraints = strings(entry.constraints) ?? [];
    if (constraints.length > MAX_CONSTRAINTS) {
      errors.push({ path: `${path}.constraints`, message: "Trop de contraintes." });
    }

    const scope = isRecord(entry.scope)
      ? {
          ...(strings(entry.scope.paths) === null
            ? {}
            : { paths: strings(entry.scope.paths) ?? [] }),
          ...(strings(entry.scope.collections) === null
            ? {}
            : { collections: strings(entry.scope.collections) ?? [] }),
          ...(strings(entry.scope.kinds) === null
            ? {}
            : { kinds: strings(entry.scope.kinds) ?? [] }),
        }
      : undefined;

    const budgetRaw = isRecord(entry.budget) ? entry.budget : undefined;
    const budget =
      budgetRaw === undefined
        ? undefined
        : {
            maxPlans: typeof budgetRaw.maxPlans === "number" ? budgetRaw.maxPlans : 0,
            maxAttempts: typeof budgetRaw.maxAttempts === "number" ? budgetRaw.maxAttempts : 0,
            ...(typeof budgetRaw.maxDurationMs === "number"
              ? { maxDurationMs: budgetRaw.maxDurationMs }
              : {}),
          };
    if (budget !== undefined && (budget.maxPlans <= 0 || budget.maxAttempts <= 0)) {
      errors.push({ path: `${path}.budget`, message: "Budget local invalide." });
    }

    const supersedes = strings(entry.supersedes) ?? [];
    const priority = typeof entry.priority === "number" ? entry.priority : undefined;

    objectives.push({
      key,
      title,
      goal,
      ...(text(entry.rationale) === "" ? {} : { rationale: text(entry.rationale) }),
      acceptanceCriteria: criteria ?? [],
      evidence,
      dependencies,
      constraints,
      ...(scope === undefined ? {} : { scope }),
      ...(budget === undefined ? {} : { budget }),
      ...(priority === undefined ? {} : { priority }),
      ...(supersedes.length === 0 ? {} : { supersedes }),
    });
  }

  for (const [index, objective] of objectives.entries()) {
    for (const dependency of objective.dependencies) {
      if (!keys.has(dependency)) {
        errors.push({
          path: `objectives[${index}].dependencies`,
          message: `Dépendance inconnue : ${dependency}.`,
        });
      }
      if (dependency === objective.key) {
        errors.push({
          path: `objectives[${index}].dependencies`,
          message: "Un objectif ne peut pas dépendre de lui-même.",
        });
      }
    }
    for (const superseded of objective.supersedes ?? []) {
      if (!knownKeys.includes(superseded) && !newKeys.has(superseded)) {
        errors.push({
          path: `objectives[${index}].supersedes`,
          message: `Objectif remplacé inconnu : ${superseded}.`,
        });
      }
    }
  }

  if (errors.length === 0 && hasCycle(objectives)) {
    errors.push({ path: "objectives", message: "Cycle de dépendances détecté." });
  }

  return errors.length === 0
    ? { ok: true, value: { schemaVersion: 1, reason, objectives } }
    : { ok: false, errors };
}

function hasCycle(objectives: MissionObjective[]): boolean {
  const byKey = new Map(objectives.map((objective) => [objective.key, objective]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    const objective = byKey.get(key);
    if (objective === undefined) return false;
    visiting.add(key);
    if (objective.dependencies.some(visit)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  return objectives.some((objective) => visit(objective.key));
}
