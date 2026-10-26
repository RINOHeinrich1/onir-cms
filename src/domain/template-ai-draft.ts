/**
 * Brouillon structuré produit par l'assistance IA d'un modèle de raisonnement
 * (ADR-0038). Ce module reste pur : aucun accès réseau, fichier ou fournisseur.
 *
 * L'IA ne rédige pas directement le prompt : elle fournit une configuration
 * structurée, puis les builders du mode simple génèrent le prompt et la fiche.
 */

import { DEFAULT_FILE_CONSTRAINTS, type FileFieldConstraints } from "@/domain/entities/attachment";
import {
  isTemplateFieldType,
  type TemplateDefinition,
  type TemplateField,
  type TemplateFieldType,
} from "@/domain/entities/chat-template";
import {
  buildDefaultRenderTemplate,
  buildDefaultSystemPrompt,
  DEFAULT_PROMPT_GUARDRAILS,
  DEFAULT_PROMPT_OBJECTIVE,
  DEFAULT_PROMPT_ROLE,
  PROMPT_GUARDRAILS,
  PROMPT_TONES,
  type PromptGuardrailId,
  toFieldName,
  uniqueFieldName,
} from "@/domain/template-defaults";
import { validateTemplateDefinition } from "@/domain/template-schema";

export const TEMPLATE_AI_MAX_KNOWLEDGE = 10;
export const TEMPLATE_AI_MAX_FIELDS = 12;
export const TEMPLATE_AI_MAX_KNOWLEDGE_TITLE = 120;
export const TEMPLATE_AI_MAX_KNOWLEDGE_CONTENT = 8_000;

export type TemplateAiKnowledgeCandidate = {
  titre: string;
  contenu: string;
};

export type TemplateAiDraft = {
  label: string;
  description: string;
  role: string;
  objective: string;
  tone: string;
  guardrails: PromptGuardrailId[];
  fields: TemplateField[];
  systemPrompt: string;
  renderTemplate: string;
  knowledge: TemplateAiKnowledgeCandidate[];
  warnings: string[];
};

export type TemplateAiDraftContext = {
  /** Clé finale du modèle (nouvelle clé ou clé existante). */
  key: string;
  /** Description fournie par l'utilisateur, utilisée si l'IA n'en fournit pas. */
  descriptionFallback?: string;
};

export type TemplateAiDraftResult =
  | { ok: true; value: TemplateAiDraft }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
    : [];
}

/** Extrait le premier objet JSON d'une réponse IA, même entourée de texte. */
export function extractAiJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function normalizeTone(value: unknown): string {
  const candidate = text(value);
  return PROMPT_TONES.some((tone) => tone.value === candidate) ? candidate : PROMPT_TONES[0].value;
}

function normalizeGuardrails(value: unknown): PromptGuardrailId[] {
  const allowed = new Set<string>(PROMPT_GUARDRAILS.map((guardrail) => guardrail.id));
  const selected = stringArray(value).filter((entry): entry is PromptGuardrailId =>
    allowed.has(entry),
  );
  return selected.length > 0 ? selected : [...DEFAULT_PROMPT_GUARDRAILS];
}

function normalizeType(value: unknown): TemplateFieldType {
  const candidate = text(value);
  return isTemplateFieldType(candidate) ? candidate : "text";
}

function fileConstraints(value: unknown): FileFieldConstraints {
  if (isRecord(value)) {
    const accept = Array.isArray(value.accept)
      ? value.accept.filter((entry): entry is string => typeof entry === "string")
      : [];
    const maxFiles = typeof value.maxFiles === "number" ? value.maxFiles : 1;
    const maxBytes = typeof value.maxBytes === "number" ? value.maxBytes : undefined;
    if (accept.length > 0) {
      return {
        ...DEFAULT_FILE_CONSTRAINTS,
        accept: accept as FileFieldConstraints["accept"],
        maxFiles: Math.max(1, Math.min(5, Math.trunc(maxFiles))),
        ...(maxBytes === undefined ? {} : { maxBytes }),
      };
    }
  }
  return { ...DEFAULT_FILE_CONSTRAINTS };
}

function normalizeFields(value: unknown, warnings: string[]): TemplateField[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.length > TEMPLATE_AI_MAX_FIELDS) {
    warnings.push(
      `L'IA a proposé ${value.length} informations ; seules les ${TEMPLATE_AI_MAX_FIELDS} premières sont conservées.`,
    );
  }

  const fields: TemplateField[] = [];
  const usedNames: string[] = [];
  for (const raw of value.slice(0, TEMPLATE_AI_MAX_FIELDS)) {
    if (!isRecord(raw)) continue;
    const label = text(raw.label) || text(raw.name);
    if (label === "") continue;
    let type: TemplateFieldType = normalizeType(raw.type);
    const options = stringArray(raw.options).filter((entry) => entry !== "");
    if ((type === "select" || type === "multi") && options.length === 0) {
      type = "text";
      warnings.push(`Le champ « ${label} » n'avait pas d'options ; il a été converti en texte.`);
    }
    const name = uniqueFieldName(toFieldName(label), usedNames);
    usedNames.push(name);
    const example = text(raw.example);
    const required = raw.required === true;
    fields.push({
      name,
      label: label.slice(0, 160),
      type,
      required,
      ...(type === "select" || type === "multi" ? { options } : {}),
      ...(example === "" ? {} : { example: example.slice(0, 300) }),
      ...(type === "file" ? { file: fileConstraints(raw.file) } : {}),
    });
  }
  return fields.length > 0 ? fields : null;
}

function normalizeKnowledge(value: unknown, warnings: string[]): TemplateAiKnowledgeCandidate[] {
  if (!Array.isArray(value)) return [];
  const result: TemplateAiKnowledgeCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const titre = (text(raw.titre) || text(raw.title)).slice(0, TEMPLATE_AI_MAX_KNOWLEDGE_TITLE);
    const contenu = (text(raw.contenu) || text(raw.content)).slice(
      0,
      TEMPLATE_AI_MAX_KNOWLEDGE_CONTENT,
    );
    if (titre === "" || contenu === "") continue;
    const fingerprint = titre.toLocaleLowerCase("fr");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push({ titre, contenu });
  }

  if (result.length > TEMPLATE_AI_MAX_KNOWLEDGE) {
    warnings.push(
      `L'IA a proposé ${result.length} connaissances ; seules les ${TEMPLATE_AI_MAX_KNOWLEDGE} premières sont conservées.`,
    );
  }
  return result.slice(0, TEMPLATE_AI_MAX_KNOWLEDGE);
}

/**
 * Valide et normalise la sortie brute de l'IA.
 * Les champs invalides sont corrigés quand c'est sans risque ; les erreurs
 * bloquantes sont retournées pour être affichées à l'utilisateur.
 */
export function parseTemplateAiDraft(
  input: unknown,
  context: TemplateAiDraftContext,
): TemplateAiDraftResult {
  if (!isRecord(input)) return { ok: false, errors: ["Réponse IA illisible"] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const label = text(input.label);
  if (label === "") errors.push("L'IA n'a pas proposé de nom de modèle");
  const fields = normalizeFields(input.fields, warnings);
  if (fields === null) errors.push("L'IA n'a proposé aucune information à collecter");

  const description = text(input.description) || context.descriptionFallback?.trim() || "";
  const role = text(input.role) || DEFAULT_PROMPT_ROLE;
  const objective = text(input.objective) || DEFAULT_PROMPT_OBJECTIVE;
  const tone = normalizeTone(input.tone);
  const guardrails = normalizeGuardrails(input.guardrails);
  const knowledge = normalizeKnowledge(input.knowledge, warnings);

  if (errors.length > 0) return { ok: false, errors };

  const normalizedFields = fields ?? [];
  const systemPrompt = buildDefaultSystemPrompt({
    role,
    objective,
    tone,
    guardrails,
    fields: normalizedFields,
  });
  const renderTemplate = buildDefaultRenderTemplate(label, normalizedFields);
  const candidate: TemplateDefinition = {
    key: context.key,
    label,
    description,
    systemPrompt,
    fields: normalizedFields,
    renderTemplate,
  };
  const validated = validateTemplateDefinition(candidate);
  if (!validated.ok) return { ok: false, errors: validated.errors };

  return {
    ok: true,
    value: {
      label: validated.value.label,
      description: validated.value.description,
      role,
      objective,
      tone,
      guardrails,
      fields: validated.value.fields,
      systemPrompt: validated.value.systemPrompt,
      renderTemplate: validated.value.renderTemplate,
      knowledge,
      warnings,
    },
  };
}
