import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type {
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "@/domain/template-params";
import type { TemplateAiSkillV1 } from "@/domain/template-skill";
import type { TemplateCapabilityMap } from "./template-capabilities";
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
  capabilities?: TemplateCapabilityMap;
  history?: TemplateEditHistoryMessage[];
  previousErrors?: string[];
  previousPlan?: unknown;
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
      "Tu produis un Plan DSL v1. Le core le validera et le compilera avant toute mutation.",
      "Tu ne peux utiliser que les identifiants présents dans les candidats.",
      "Tu ne peux pas inventer d’identifiant, de collection ou de champ.",
      "Une cible existante est référencée par candidateId sous la forme collection:itemId.",
      'Pour un objet créé dans une étape, réutilise son id d’étape sous la forme {"$ref":"step-id"}.',
      'Pour une valeur existante référencée, utilise {"$candidate":"collection:itemId"}.',
      "Les chaînes brutes ne sont pas des références métier.",
      "Opérations autorisées :",
      '- set paramètre : {"op":"set","target":{"kind":"param","path":"..."},"value":...}',
      '- set candidat : {"op":"set","candidateId":"collection:itemId","field":"...","value":...}',
      '- insert : {"op":"insert","target":{"kind":"collection","collection":"..."},"values":{...}}',
      '- insertChild : {"op":"insertChild","parent":"collection:itemId"|{"$ref":"step-id"},"child":{"collection":"...","kind":"...","slot":"...","values":{...}}}',
      '- remove / duplicate : {"op":"remove"|"duplicate","candidateId":"collection:itemId"}',
      '- move : {"op":"move","candidateId":"...","parent":"collection:itemId"|{"$ref":"step-id"},"position":0}',
      "Si tu ne peux pas atteindre l’objectif avec ces opérations, retourne steps=[] avec une clarification ou un warning. N’invente jamais de collection, de champ ou d’identifiant.",
      'Format JSON : {"schemaVersion":1,"intent":"create|reuse|update|noop","steps":[{"id":"step-id","operation":{...},"description":"..."}],"warnings":[],"clarification":null}',
      "Ne fournis pas steps et clarification en même temps.",
    ].join("\n"),
    user: [
      `Demande : ${input.request}`,
      `Conversation précédente :\n${formatTemplateEditHistory(input.history ?? [])}`,
      `Page courante : ${input.page === null ? "aucune" : `${input.page.label} (${input.page.pageId})`}`,
      `Candidats : ${JSON.stringify(items)}`,
      `Schémas des collections candidates : ${JSON.stringify(schemas)}`,
      `Règles d’insertion : ${JSON.stringify(insertion)}`,
      `Skills : ${JSON.stringify(skills)}`,
      `Capacités du template : ${JSON.stringify(input.capabilities ?? null)}`,
      ...(input.previousErrors === undefined || input.previousErrors.length === 0
        ? []
        : [
            `Erreurs du plan précédent : ${JSON.stringify(input.previousErrors)}`,
            `Plan précédent : ${JSON.stringify(input.previousPlan ?? null)}`,
          ]),
    ].join("\n\n"),
  };
}
