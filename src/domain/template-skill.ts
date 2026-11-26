/** Skills IA déclarés par un template (ADR-0110). */

export const TEMPLATE_SKILL_FORMAT = "onirtech.ai-skill.v1";
export const TEMPLATE_SKILL_SCHEMA_VERSION = 1;
export const TEMPLATE_SKILL_MAX_PER_VERSION = 16;
export const TEMPLATE_SKILL_MAX_BYTES = 64 * 1024;
export const TEMPLATE_SKILL_TOTAL_MAX_BYTES = 256 * 1024;
export const TEMPLATE_SKILL_MAX_INTENTS = 8;
export const TEMPLATE_SKILL_MAX_EXAMPLES = 8;

export type TemplateAiSkillRef = {
  id: string;
  format: typeof TEMPLATE_SKILL_FORMAT;
  path: string;
  integrity: string;
};

export type TemplateAiSkillIntent = {
  id: string;
  description: string;
  keywords: string[];
  examples: string[];
};

export type TemplateAiSkillV1 = {
  schemaVersion: typeof TEMPLATE_SKILL_SCHEMA_VERSION;
  format: typeof TEMPLATE_SKILL_FORMAT;
  id: string;
  title: string;
  description: string;
  version: string;
  priority: number;
  always: boolean;
  intents: TemplateAiSkillIntent[];
  instructions: string[];
  context: {
    include: string[];
    maxCandidates: number;
  };
  operations: {
    allowed: string[];
    constraints: string[];
  };
  examples: Array<{ request: string; notes?: string }>;
};

export type TemplateSkillValidationError = { field: string; message: string };

const KEBAB = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/;
const INTEGRITY = /^sha256-[A-Za-z0-9+/]+={0,2}$/;
const ALLOWED_OPERATIONS = new Set(["set", "insert", "insertChild", "remove", "duplicate", "move"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safePath(path: string): boolean {
  return (
    path.startsWith("skills/") &&
    path.endsWith(".json") &&
    !path.includes("..") &&
    !path.includes("\\") &&
    path.split("/").every((part) => part !== "" && part !== ".")
  );
}

export function validateTemplateAiSkillRefs(
  input: unknown,
):
  | { ok: true; value: TemplateAiSkillRef[] }
  | { ok: false; errors: TemplateSkillValidationError[] } {
  if (input === undefined) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ field: "aiSkills", message: "liste de skills attendue" }] };
  }
  if (input.length > TEMPLATE_SKILL_MAX_PER_VERSION) {
    return {
      ok: false,
      errors: [
        {
          field: "aiSkills",
          message: ` maximum ${TEMPLATE_SKILL_MAX_PER_VERSION} skills par version`,
        },
      ],
    };
  }
  const errors: TemplateSkillValidationError[] = [];
  const refs: TemplateAiSkillRef[] = [];
  const seen = new Set<string>();
  input.forEach((raw, index) => {
    const base = `aiSkills[${index}]`;
    if (!isRecord(raw)) {
      errors.push({ field: base, message: "objet attendu" });
      return;
    }
    const id = text(raw.id);
    const format = text(raw.format);
    const path = text(raw.path);
    const integrity = text(raw.integrity);
    if (!KEBAB.test(id)) errors.push({ field: `${base}.id`, message: "id kebab-case attendu" });
    if (seen.has(id)) errors.push({ field: `${base}.id`, message: `id dupliqué : ${id}` });
    seen.add(id);
    if (format !== TEMPLATE_SKILL_FORMAT) {
      errors.push({
        field: `${base}.format`,
        message: `format attendu : ${TEMPLATE_SKILL_FORMAT}`,
      });
    }
    if (!safePath(path)) {
      errors.push({
        field: `${base}.path`,
        message: "chemin skills/*.json relatif et sûr attendu",
      });
    }
    if (!INTEGRITY.test(integrity)) {
      errors.push({ field: `${base}.integrity`, message: "SRI sha256-<base64> attendu" });
    }
    refs.push({
      id,
      format: TEMPLATE_SKILL_FORMAT,
      path,
      integrity,
    });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: refs };
}

export function validateTemplateAiSkill(
  input: unknown,
): { ok: true; value: TemplateAiSkillV1 } | { ok: false; errors: TemplateSkillValidationError[] } {
  const errors: TemplateSkillValidationError[] = [];
  const add = (field: string, message: string): void => {
    errors.push({ field, message });
  };
  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: "skill", message: "objet attendu" }] };
  }
  const id = text(input.id);
  if (!KEBAB.test(id)) add("id", "id kebab-case attendu");
  if (input.schemaVersion !== TEMPLATE_SKILL_SCHEMA_VERSION) {
    add("schemaVersion", `schemaVersion doit valoir ${TEMPLATE_SKILL_SCHEMA_VERSION}`);
  }
  if (text(input.format) !== TEMPLATE_SKILL_FORMAT) {
    add("format", `format attendu : ${TEMPLATE_SKILL_FORMAT}`);
  }
  const version = text(input.version);
  if (!SEMVER.test(version)) add("version", "version SemVer attendue");
  if (typeof input.title !== "string" || text(input.title) === "") add("title", "titre requis");
  if (typeof input.description !== "string" || text(input.description) === "") {
    add("description", "description requise");
  }
  const priority = input.priority;
  if (priority !== undefined && (!Number.isInteger(priority) || (priority as number) < 0)) {
    add("priority", "entier positif attendu");
  }
  if (input.always !== undefined && typeof input.always !== "boolean") {
    add("always", "booléen attendu");
  }

  const intents = Array.isArray(input.intents) ? input.intents : [];
  if (!Array.isArray(input.intents) || intents.length === 0) {
    add("intents", "au moins une intention attendue");
  }
  if (intents.length > TEMPLATE_SKILL_MAX_INTENTS) {
    add("intents", `maximum ${TEMPLATE_SKILL_MAX_INTENTS} intentions`);
  }
  const parsedIntents: TemplateAiSkillIntent[] = [];
  intents.forEach((raw, index) => {
    if (!isRecord(raw)) {
      add(`intents[${index}]`, "objet attendu");
      return;
    }
    const intentId = text(raw.id);
    const intentDescription = text(raw.description);
    const keywords = Array.isArray(raw.keywords)
      ? raw.keywords.filter((entry): entry is string => typeof entry === "string")
      : [];
    const examples = Array.isArray(raw.examples)
      ? raw.examples.filter((entry): entry is string => typeof entry === "string")
      : [];
    if (!KEBAB.test(intentId)) add(`intents[${index}].id`, "id kebab-case attendu");
    if (intentDescription === "") add(`intents[${index}].description`, "description requise");
    if (examples.length > TEMPLATE_SKILL_MAX_EXAMPLES) {
      add(`intents[${index}].examples`, `maximum ${TEMPLATE_SKILL_MAX_EXAMPLES} exemples`);
    }
    parsedIntents.push({ id: intentId, description: intentDescription, keywords, examples });
  });

  const instructions = Array.isArray(input.instructions)
    ? input.instructions.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (instructions.length === 0) add("instructions", "au moins une instruction attendue");

  const context = isRecord(input.context) ? input.context : {};
  const include = Array.isArray(context.include)
    ? context.include.filter((entry): entry is string => typeof entry === "string")
    : [];
  const maxCandidates =
    typeof context.maxCandidates === "number" && Number.isInteger(context.maxCandidates)
      ? context.maxCandidates
      : 8;
  if (maxCandidates < 1 || maxCandidates > 20) add("context.maxCandidates", "entier 1..20 attendu");

  const operations = isRecord(input.operations) ? input.operations : {};
  const allowed = Array.isArray(operations.allowed)
    ? operations.allowed.filter((entry): entry is string => typeof entry === "string")
    : [];
  for (const operation of allowed) {
    if (!ALLOWED_OPERATIONS.has(operation))
      add("operations.allowed", `opération inconnue : ${operation}`);
  }
  const constraints = Array.isArray(operations.constraints)
    ? operations.constraints.filter((entry): entry is string => typeof entry === "string")
    : [];

  const examples = Array.isArray(input.examples) ? input.examples : [];
  const parsedExamples: Array<{ request: string; notes?: string }> = [];
  examples.forEach((raw, index) => {
    if (!isRecord(raw)) {
      add(`examples[${index}]`, "objet attendu");
      return;
    }
    const request = text(raw.request);
    if (request === "") add(`examples[${index}].request`, "request requise");
    parsedExamples.push({
      request,
      ...(text(raw.notes) === "" ? {} : { notes: text(raw.notes) }),
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: TEMPLATE_SKILL_SCHEMA_VERSION,
      format: TEMPLATE_SKILL_FORMAT,
      id,
      title: text(input.title),
      description: text(input.description),
      version,
      priority: typeof priority === "number" ? priority : 0,
      always: input.always === true,
      intents: parsedIntents,
      instructions,
      context: { include, maxCandidates },
      operations: { allowed, constraints },
      examples: parsedExamples,
    },
  };
}
