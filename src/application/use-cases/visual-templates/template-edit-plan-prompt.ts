import type { TemplateEditPlan } from "@/domain/template-edit-plan";
import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type {
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "@/domain/template-params";
import type { TemplateAiSkillV1 } from "@/domain/template-skill";
import {
  formatTemplateEditHistory,
  type TemplateEditHistoryMessage,
} from "./template-edit-history";

const MAX_CANDIDATES = 30;

function isRecord(value: unknown): value is Record<string, TemplateParamValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function itemFor(
  values: TemplateParamValues,
  collection: string,
  key: string,
  itemId: string,
): Record<string, TemplateParamValue> | null {
  const raw = values[collection];
  if (!Array.isArray(raw)) return null;
  return (
    raw.find((entry): entry is Record<string, TemplateParamValue> => {
      return isRecord(entry) && entry[key] === itemId;
    }) ?? null
  );
}

function candidateKey(candidate: TemplateEditCandidate): string {
  return `${candidate.collection}:${candidate.itemId}`;
}

export function buildTemplateEditPlanPrompt(input: {
  request: string;
  page: TemplateEditPageContext | null;
  candidates: TemplateEditCandidate[];
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  skills: TemplateAiSkillV1[];
  history?: TemplateEditHistoryMessage[];
  previousErrors?: string[];
  previousPlan?: TemplateEditPlan | null;
}): { system: string; user: string } {
  const candidates = input.candidates.slice(0, MAX_CANDIDATES);
  const collectionParams = new Set(candidates.map((candidate) => candidate.collection));
  const schemas = input.schema.filter((node) => collectionParams.has(node.key));
  const insertion = input.editor.version === 2 ? (input.editor.insertion ?? []) : [];
  const items = candidates.map((candidate) => ({
    id: candidateKey(candidate),
    label: candidate.label,
    kind: candidate.itemKind ?? null,
    scope: candidate.scope,
    current: itemFor(input.values, candidate.collection, candidate.itemKey, candidate.itemId),
  }));
  const skills = input.skills.map((skill) => ({
    id: skill.id,
    version: skill.version,
    instructions: skill.instructions,
    examples: skill.examples,
    constraints: skill.operations.constraints,
  }));

  return {
    system: [
      "Tu es le planificateur d’édition d’un template visuel ONIR-CMS.",
      "Tu produis un plan ordonné d’opérations existantes, puis le core l’exécute.",
      "Tu ne peux utiliser que les identifiants présents dans la liste des candidats.",
      "Tu ne peux pas inventer d’identifiant.",
      'Pour un objet créé pendant le plan, donne un id d’étape et réutilise-le sous la forme "$ref:<stepId>" dans les étapes suivantes.',
      'Exemple : insert page id=page → insert action target="$ref:page" → insertChild menu_item action_id="$ref:action".',
      "Les opérations autorisées sont exactement : set, insert, insertChild, remove, duplicate, move.",
      "Si une étape échoue, le core te renverra l’erreur et tu devras proposer un plan corrigé.",
      "Si tu ne peux pas atteindre l’objectif avec les opérations existantes, retourne steps=[] et une clarification ou un warning. N’invente jamais de collection, de champ ou d’identifiant.",
      'Format JSON : {"steps":[{"id":"step-id","operation":{"op":"..."},"description":"..."}],"warnings":[],"clarification":null|"..."}',
    ].join("\n"),
    user: [
      `Demande : ${input.request}`,
      `Conversation précédente :\n${formatTemplateEditHistory(input.history ?? [])}`,
      `Page courante : ${input.page === null ? "aucune" : `${input.page.label} (${input.page.pageId})`}`,
      `Candidats : ${JSON.stringify(items)}`,
      `Schémas des collections candidates : ${JSON.stringify(schemas)}`,
      `Règles d’insertion : ${JSON.stringify(insertion)}`,
      `Skills : ${JSON.stringify(skills)}`,
      ...(input.previousErrors === undefined || input.previousErrors.length === 0
        ? []
        : [
            `Erreurs du plan précédent : ${JSON.stringify(input.previousErrors)}`,
            `Plan précédent : ${JSON.stringify(input.previousPlan ?? null)}`,
          ]),
    ].join("\n\n"),
  };
}
