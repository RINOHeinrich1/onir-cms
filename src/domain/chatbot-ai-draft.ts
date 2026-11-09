/**
 * Brouillon structuré produit par l'assistance IA d'un chatbot.
 * L'IA propose une fiche de collecte et un comportement, jamais des tables legacy. Ce module reste pur : aucun accès réseau, fichier ou fournisseur.
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
  type ChatbotFallback,
  defaultChatbotFallback,
  parseChatbotFallback,
} from "@/domain/entities/chatbot-config";
import {
  buildDefaultRenderTemplate,
  buildDefaultSystemPrompt,
  toFieldName,
  toTemplateKey,
  uniqueFieldName,
} from "@/domain/template-defaults";
import { validateTemplateDefinition } from "@/domain/template-schema";
import {
  normalizeLanguagePolicy,
  type TemplateLanguagePolicy,
  type TemplateSimpleSettings,
} from "@/domain/template-settings";

export const TEMPLATE_AI_MAX_KNOWLEDGE = 10;
export const TEMPLATE_AI_MAX_FIELDS = 12;
export const TEMPLATE_AI_MAX_KNOWLEDGE_TITLE = 120;
export const TEMPLATE_AI_MAX_KNOWLEDGE_CONTENT = 8_000;

export type ChatbotAiKnowledgeSource =
  | { type: "page"; url: string }
  | { type: "document"; filename: string };

export type ChatbotAiKnowledgeCandidate = {
  titre: string;
  contenu: string;
  source?: ChatbotAiKnowledgeSource;
};

export type ChatbotAiForm = {
  key: string;
  label: string;
  description: string;
  intent: string;
  fields: TemplateField[];
};

export type ChatbotAiDraft = {
  label: string;
  description: string;
  role: string;
  objective: string;
  language: TemplateLanguagePolicy;
  tone: string;
  guardrails: string[];
  extraInstructions: string;
  fields: TemplateField[];
  /** Formulaires composés proposés par l'IA (ADR-0083). */
  forms?: ChatbotAiForm[];
  /** Formulaire racine dans `forms`. */
  rootFormKey?: string;
  systemPrompt: string;
  renderTemplate: string;
  knowledge: ChatbotAiKnowledgeCandidate[];
  fallback: ChatbotFallback;
  warnings: string[];
  settings: TemplateSimpleSettings;
};

export type ChatbotAiDraftContext = {
  /** Clé finale du chatbot (nouvelle clé ou clé existante). */
  key: string;
  /** Description fournie par l'utilisateur, utilisée si l'IA n'en fournit pas. */
  descriptionFallback?: string;
};

export type ChatbotAiDraftResult =
  | { ok: true; value: ChatbotAiDraft }
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
  return text(value).slice(0, 200);
}

/** Conserve les suggestions connues et les instructions personnalisées. */
function normalizeGuardrails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const candidate = isRecord(raw)
      ? text(raw.instruction) || text(raw.label) || text(raw.value)
      : text(raw);
    if (candidate === "") continue;
    const clipped = candidate.slice(0, 500);
    const fingerprint = clipped.toLocaleLowerCase("fr");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(clipped);
  }
  return result.slice(0, 20);
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

function normalizeFields(value: unknown, warnings: string[]): TemplateField[] {
  if (!Array.isArray(value)) return [];
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
      ...(type === "fiche" || type === "tableau_de_fiches" ? { ficheKey: text(raw.ficheKey) } : {}),
    });
  }
  return fields;
}

function normalizeKnowledge(value: unknown, warnings: string[]): ChatbotAiKnowledgeCandidate[] {
  if (!Array.isArray(value)) return [];
  const result: ChatbotAiKnowledgeCandidate[] = [];
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

function stripFicheReference(field: TemplateField): TemplateField {
  const { ficheKey: _ficheKey, ...rest } = field;
  return { ...rest, type: "text" };
}

function normalizeForms(
  value: unknown,
  rootValue: unknown,
  warnings: string[],
): { forms: ChatbotAiForm[]; rootKey: string } | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const forms: ChatbotAiForm[] = [];
  const usedKeys = new Set<string>();
  for (const raw of value.slice(0, 5)) {
    if (!isRecord(raw)) continue;
    const label = text(raw.label) || text(raw.key);
    const key = toTemplateKey(text(raw.key) || label);
    if (key === "" || usedKeys.has(key)) {
      warnings.push(`Formulaire IA ignoré : clé absente ou dupliquée (${key || "vide"}).`);
      continue;
    }
    usedKeys.add(key);
    forms.push({
      key,
      label: label.slice(0, 160),
      description: text(raw.description),
      intent: text(raw.intent),
      fields: normalizeFields(raw.fields, warnings),
    });
  }
  if (forms.length === 0) return null;

  const normalizedFormKeys = new Set(forms.map((form) => toTemplateKey(form.key)));
  for (const form of forms) {
    form.fields = form.fields.map((field) => {
      if (field.type !== "fiche" && field.type !== "tableau_de_fiches") return field;
      const normalizedKey = toTemplateKey(field.ficheKey ?? "");
      if (normalizedKey === "" || !normalizedFormKeys.has(normalizedKey)) {
        warnings.push(
          `Référence de sous-fiche invalide dans « ${form.label} » : ${field.ficheKey ?? "vide"} ; champ converti en texte.`,
        );
        return stripFicheReference(field);
      }
      return { ...field, ficheKey: normalizedKey };
    });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const form = forms.find((entry) => entry.key === key);
    for (const field of form?.fields ?? []) {
      if (field.ficheKey !== undefined && hasCycle(field.ficheKey)) return true;
    }
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  for (const form of forms) {
    if (hasCycle(form.key)) {
      warnings.push(
        `Cycle de sous-fiches détecté autour de « ${form.label} » ; composition simplifiée.`,
      );
      form.fields = form.fields.map((field) =>
        field.ficheKey === undefined ? field : stripFicheReference(field),
      );
      break;
    }
  }

  const requestedRoot = toTemplateKey(text(rootValue));
  const rootKey = forms.find((form) => form.key === requestedRoot)?.key ?? forms[0]?.key ?? "";
  if (rootKey === "") return null;
  if (requestedRoot !== "" && forms.every((form) => form.key !== requestedRoot)) {
    warnings.push(`Formulaire racine inconnu « ${requestedRoot} » ; « ${rootKey} » utilisé.`);
  }
  return { forms, rootKey };
}

/**
 * Valide et normalise la sortie brute de l'IA.
 * Les champs invalides sont corrigés quand c'est sans risque ; les erreurs
 * bloquantes sont retournées pour être affichées à l'utilisateur.
 */
export function parseChatbotAiDraft(
  input: unknown,
  context: ChatbotAiDraftContext,
): ChatbotAiDraftResult {
  if (!isRecord(input)) return { ok: false, errors: ["Réponse IA illisible"] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const label = text(input.label);
  if (label === "") errors.push("L'IA n'a pas proposé de nom de chatbot");
  const normalizedForms = normalizeForms(input.forms, input.rootFormKey, warnings);
  const normalizedFields =
    normalizedForms === null
      ? normalizeFields(input.fields, warnings).map((field) => {
          if (field.type !== "fiche" && field.type !== "tableau_de_fiches") return field;
          warnings.push(
            `Composition sans formulaire « ${field.label} » ignorée ; champ converti en texte.`,
          );
          return stripFicheReference(field);
        })
      : (normalizedForms.forms.find((form) => form.key === normalizedForms.rootKey)?.fields ?? []);

  const description = text(input.description) || context.descriptionFallback?.trim() || "";
  const role = text(input.role);
  if (role === "") errors.push("L'IA n'a pas proposé de rôle");
  const objective = text(input.objective);
  const language = normalizeLanguagePolicy(input.language);
  const tone = normalizeTone(input.tone);
  const guardrails = normalizeGuardrails(input.guardrails);
  const extraInstructions = text(input.extraInstructions).slice(0, 4_000);
  const knowledge = normalizeKnowledge(input.knowledge, warnings);
  const parsedFallback = parseChatbotFallback(input.fallback);
  const fallback = parsedFallback.ok ? parsedFallback.value : defaultChatbotFallback();
  if (!parsedFallback.ok) {
    warnings.push(`Fallback non généré : ${parsedFallback.error}`);
  }
  if (normalizedFields.length === 0) {
    fallback.showCollectionForm = false;
  }

  if (errors.length > 0) return { ok: false, errors };

  const settings: TemplateSimpleSettings = {
    role,
    objective,
    language,
    tone,
    guardrails,
    extraInstructions,
  };
  const systemPrompt = buildDefaultSystemPrompt({
    role,
    objective,
    language,
    tone,
    guardrails,
    extraInstructions,
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
    simple: settings,
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
      language,
      tone,
      guardrails,
      extraInstructions,
      fields: validated.value.fields,
      ...(normalizedForms === null
        ? {}
        : { forms: normalizedForms.forms, rootFormKey: normalizedForms.rootKey }),
      systemPrompt: validated.value.systemPrompt,
      renderTemplate: validated.value.renderTemplate,
      knowledge,
      fallback,
      warnings,
      settings,
    },
  };
}
