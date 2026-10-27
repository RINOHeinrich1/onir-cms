/**
 * Valeurs par défaut des modèles de raisonnement (mode simple).
 * Le mode simple ne demande pas d'écrire le prompt ni le Markdown : ces
 * helpers génèrent une base compréhensible à partir du rôle, du ton, des
 * garde-fous et des informations à collecter. Le mode expert reste libre.
 */

import type { TemplateField } from "@/domain/entities/chat-template";
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  languageInstruction,
  type TemplateLanguagePolicy,
} from "@/domain/template-settings";

export const PROMPT_TONES = [
  { value: "professionnel et chaleureux", label: "Professionnel et chaleureux" },
  { value: "direct et concis", label: "Direct et concis" },
  { value: "pédagogique", label: "Pédagogique" },
  { value: "commercial et enthousiaste", label: "Commercial et enthousiaste" },
] as const;

export type PromptGuardrailId =
  | "professional"
  | "no_promise"
  | "one_question"
  | "known_contacts"
  | "finish";

export const PROMPT_GUARDRAILS: ReadonlyArray<{
  id: PromptGuardrailId;
  label: string;
  instruction: string;
}> = [
  {
    id: "professional",
    label: "Rester dans le cadre professionnel",
    instruction:
      "Tu restes strictement dans le cadre professionnel : si on te pose une question hors sujet, tu refuses poliment et tu proposes de revenir au sujet.",
  },
  {
    id: "no_promise",
    label: "Ne promettre ni prix, ni délai, ni livrable",
    instruction:
      "Tu ne promets jamais de prix, de délai ni de livrable : tu collectes les informations et c'est l'équipe qui chiffrera.",
  },
  {
    id: "one_question",
    label: "Poser une question à la fois et rester concis",
    instruction: "Tu poses une question à la fois et tu gardes tes réponses courtes.",
  },
  {
    id: "known_contacts",
    label: "Ne pas redemander les coordonnées déjà connues",
    instruction:
      "{{#if prospect_connu}}Tu parles déjà avec un prospect connu : ne lui redemande pas ses coordonnées de base.\n{{prospect_contexte}}{{/if}}{{#if visiteur_connu}}Le visiteur s'est déjà identifié : ne lui redemande pas son nom ni son email.{{/if}}",
  },
  {
    id: "finish",
    label: "Inviter à cliquer sur « Terminer » à la fin",
    instruction:
      "Dès que tu as réuni les informations essentielles, invite explicitement le visiteur à cliquer sur le bouton « Terminer » pour envoyer sa fiche. Précise que sans ce clic, elle n'est pas transmise à l'équipe.",
  },
];

/** Aucun garde-fou n'est activé implicitement. */
export const DEFAULT_PROMPT_GUARDRAILS: string[] = [];

const GUARDRAIL_BY_ID = new Map<string, (typeof PROMPT_GUARDRAILS)[number]>(
  PROMPT_GUARDRAILS.map((guardrail) => [guardrail.id, guardrail]),
);
const GUARDRAIL_BY_LABEL = new Map<string, (typeof PROMPT_GUARDRAILS)[number]>(
  PROMPT_GUARDRAILS.map((guardrail) => [guardrail.label, guardrail]),
);

/** Résout un identifiant de suggestion ou conserve une instruction libre. */
export function resolveGuardrailInstruction(value: string): string {
  const trimmed = value.trim();
  return (
    GUARDRAIL_BY_ID.get(trimmed)?.instruction ??
    GUARDRAIL_BY_LABEL.get(trimmed)?.instruction ??
    trimmed
  );
}

export function guardrailLabel(value: string): string {
  return GUARDRAIL_BY_ID.get(value)?.label ?? value;
}

/** Construit un prompt système à partir des réglages, sans restriction implicite. */
export function buildDefaultSystemPrompt(input: {
  role: string;
  objective: string;
  language?: TemplateLanguagePolicy;
  tone: string;
  guardrails: readonly string[];
  extraInstructions?: string;
  fields: readonly TemplateField[];
}): string {
  const role = input.role.trim();
  const objective = input.objective.trim();
  const tone = input.tone.trim();
  const language = input.language ?? DEFAULT_TEMPLATE_LANGUAGE;
  const lines: string[] = [];

  if (role !== "") lines.push(`Tu es ${role}.`);
  lines.push("", languageInstruction(language));
  if (tone !== "") lines.push("", `Adopte un ton ${tone}.`);
  if (input.extraInstructions !== undefined && input.extraInstructions.trim() !== "") {
    lines.push("", input.extraInstructions.trim());
  }

  const seen = new Set<string>();
  for (const guardrail of input.guardrails) {
    const instruction = resolveGuardrailInstruction(guardrail);
    if (instruction === "" || seen.has(instruction)) continue;
    seen.add(instruction);
    lines.push("", instruction);
  }

  if (objective !== "") lines.push("", "Ton objectif :", objective);
  if (input.fields.length > 0) {
    lines.push("", "Informations à réunir :", "{{champs_guide}}");
  }

  return lines.join("\n").trim();
}

/**
 * Construit une fiche Markdown simple à partir des informations collectées.
 * Les champs facultatifs (ou conditionnels) sont masqués quand ils sont vides.
 */
export function buildDefaultRenderTemplate(
  label: string,
  fields: readonly TemplateField[],
): string {
  const title = label.trim() === "" ? "Fiche" : label.trim();
  const parts: string[] = [`# ${title}`, "", "Date : {{date}}"];

  for (const field of fields) {
    const fieldLabel = field.label.trim() === "" ? field.name : field.label.trim();
    if (field.name.trim() === "" || fieldLabel === "") continue;
    const block = `## ${fieldLabel}\n\n{{${field.name}}}`;
    const conditional = field.required === false || field.requiredIf !== undefined;
    parts.push("", conditional ? `{{#if ${field.name}}}${block}{{/if}}` : block);
  }

  return `${parts.join("\n")}\n`;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Transforme un libellé en clé de modèle valide. */
export function toTemplateKey(label: string): string {
  const base = normalize(label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base === "") return "modele";
  return /^[0-9]/.test(base) ? `modele-${base}` : base;
}

/** Transforme un libellé en nom technique de champ valide. */
/**
 * Clé technique d'un champ : la clé existante est conservée pour ne pas casser
 * les modèles legacy ; seuls les nouveaux champs sont dérivés du libellé.
 */
export function resolveFieldName(label: string, existingName: string): string {
  const existing = existingName.trim();
  return existing !== "" ? existing : toFieldName(label);
}

export function toFieldName(label: string): string {
  const base = normalize(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base === "") return "champ";
  return /^[a-z]/.test(base) ? base : `champ_${base}`;
}

/** Garantit une clé unique parmi les modèles existants. */
export function uniqueTemplateKey(base: string, existing: readonly string[]): string {
  const clean = base.trim() === "" ? "modele" : base.trim();
  const used = new Set(existing);
  if (!used.has(clean)) return clean;
  let suffix = 2;
  while (used.has(`${clean}-${suffix}`)) suffix += 1;
  return `${clean}-${suffix}`;
}

/** Garantit un nom de champ unique parmi les champs déjà utilisés. */
export function uniqueFieldName(base: string, existing: readonly string[]): string {
  const clean = base.trim() === "" ? "champ" : base.trim();
  const used = new Set(existing);
  if (!used.has(clean)) return clean;
  let suffix = 2;
  while (used.has(`${clean}_${suffix}`)) suffix += 1;
  return `${clean}_${suffix}`;
}
