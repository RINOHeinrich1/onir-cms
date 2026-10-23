/**
 * Valeurs par défaut des modèles de raisonnement (mode simple).
 * Le mode simple ne demande pas d'écrire le prompt ni le Markdown : ces
 * helpers génèrent une base compréhensible à partir du rôle, du ton, des
 * garde-fous et des informations à collecter. Le mode expert reste libre.
 */

import type { TemplateField } from "@/domain/entities/chat-template";

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
}> = [
  { id: "professional", label: "Rester dans le cadre professionnel" },
  { id: "no_promise", label: "Ne promettre ni prix, ni délai, ni livrable" },
  { id: "one_question", label: "Poser une question à la fois et rester concis" },
  { id: "known_contacts", label: "Ne pas redemander les coordonnées déjà connues" },
  { id: "finish", label: "Inviter à cliquer sur « Terminer » à la fin" },
];

export const DEFAULT_PROMPT_GUARDRAILS: PromptGuardrailId[] = PROMPT_GUARDRAILS.map(
  (guardrail) => guardrail.id,
);

export const DEFAULT_PROMPT_ROLE = "l'assistant de prospection";
export const DEFAULT_PROMPT_OBJECTIVE =
  "Comprendre le besoin du visiteur et réunir les informations nécessaires pour que l'équipe puisse le recontacter.";

function hasGuardrail(guardrails: readonly string[], id: PromptGuardrailId): boolean {
  return guardrails.includes(id);
}

/** Construit un prompt système lisible et fonctionnel (variables incluses). */
export function buildDefaultSystemPrompt(input: {
  role: string;
  objective: string;
  tone: string;
  guardrails: readonly string[];
  fields: readonly TemplateField[];
}): string {
  const role = input.role.trim() === "" ? DEFAULT_PROMPT_ROLE : input.role.trim();
  const objective =
    input.objective.trim() === "" ? DEFAULT_PROMPT_OBJECTIVE : input.objective.trim();
  const tone = input.tone.trim() === "" ? PROMPT_TONES[0].value : input.tone.trim();
  const lines: string[] = [
    `Tu es ${role}.`,
    "",
    `Tu t'exprimes en français naturel, avec un ton ${tone}.`,
  ];

  if (hasGuardrail(input.guardrails, "professional")) {
    lines.push(
      "",
      "Tu restes strictement dans le cadre professionnel : si on te pose une question hors sujet, tu refuses poliment et tu proposes de revenir au sujet.",
    );
  }
  if (hasGuardrail(input.guardrails, "no_promise")) {
    lines.push(
      "",
      "Tu ne promets jamais de prix, de délai ni de livrable : tu collectes les informations et c'est l'équipe qui chiffrera.",
    );
  }
  if (hasGuardrail(input.guardrails, "one_question")) {
    lines.push("", "Tu poses une question à la fois et tu gardes tes réponses courtes.");
  }

  lines.push("", "Ton objectif :", objective);
  if (input.fields.length > 0) {
    lines.push("", "Informations à réunir :", "{{champs_guide}}");
  }
  if (hasGuardrail(input.guardrails, "known_contacts")) {
    lines.push(
      "",
      "{{#if prospect_connu}}Tu parles déjà avec un prospect connu : ne lui redemande pas ses coordonnées de base.",
      "{{prospect_contexte}}{{/if}}{{#if visiteur_connu}}Le visiteur s'est déjà identifié : ne lui redemande pas son nom ni son email.{{/if}}",
    );
  }
  if (hasGuardrail(input.guardrails, "finish")) {
    lines.push(
      "",
      "Dès que tu as réuni les informations essentielles, invite explicitement le visiteur à cliquer sur le bouton « Terminer » pour envoyer sa fiche. Précise que sans ce clic, elle n'est pas transmise à l'équipe.",
    );
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
