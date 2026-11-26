import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type {
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "@/domain/template-params";
import type { TemplateAiSkillV1 } from "@/domain/template-skill";

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

function schemaNode(params: TemplateParamSchema[], key: string): TemplateParamSchema | null {
  return params.find((entry) => entry.key === key) ?? null;
}

function styleReferences(input: {
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  candidate: TemplateEditCandidate;
  item: Record<string, TemplateParamValue> | null;
  values: TemplateParamValues;
}): Array<Record<string, unknown>> {
  const editor = input.editor;
  const item = input.item;
  if (editor.version !== 2 || item === null) return [];
  return (editor.references ?? []).flatMap((reference) => {
    if (reference.from !== input.candidate.collection || reference.to === undefined) return [];
    const targetScope = editor.scopes?.find(
      (entry) => entry.param === reference.to && entry.scope === "shared",
    );
    if (targetScope === undefined || !(reference.field in item)) return [];
    const collection = editor.collections?.find((entry) => entry.param === reference.to);
    const styleId = item[reference.field];
    const style =
      typeof styleId === "string"
        ? itemFor(input.values, reference.to, collection?.itemKey ?? "id", styleId)
        : null;
    return [
      {
        field: reference.field,
        collection: reference.to,
        itemKey: collection?.itemKey ?? "id",
        currentId: typeof styleId === "string" ? styleId : null,
        schema: schemaNode(input.schema, reference.to),
        current: style,
        shared: true,
      },
    ];
  });
}

export function buildTemplateEditProposalPrompt(input: {
  request: string;
  page: TemplateEditPageContext | null;
  candidate: TemplateEditCandidate;
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  skills: TemplateAiSkillV1[];
}): { system: string; user: string } {
  const candidate = input.candidate;
  const collection =
    input.editor.version === 2
      ? input.editor.collections?.find((entry) => entry.param === candidate.collection)
      : undefined;
  const item = itemFor(input.values, candidate.collection, candidate.itemKey, candidate.itemId);
  const collectionSchema = schemaNode(input.schema, candidate.collection);
  const rules =
    input.editor.version === 2 && candidate.itemKind !== undefined
      ? (input.editor.insertion ?? []).filter((rule) => rule.parentKind === candidate.itemKind)
      : [];
  const styles = styleReferences({
    editor: input.editor,
    schema: input.schema,
    candidate,
    item,
    values: input.values,
  });
  const target = {
    id: `${candidate.collection}:${candidate.itemId}`,
    collection: candidate.collection,
    itemKey: candidate.itemKey,
    itemId: candidate.itemId,
    label: candidate.label,
    kind: candidate.itemKind ?? null,
    scope: candidate.scope,
  };

  return {
    system: [
      "Tu produis une proposition de modification d’un template visuel ONIR-CMS.",
      "Tu ne dois jamais inventer d’identifiant : utilise les ids fournis.",
      "Tu ne dois pas modifier un fichier, du HTML, du CSS ou du JavaScript.",
      "Tu réponds uniquement avec un objet JSON valide, sans markdown.",
      'Format : {"operations":[...],"warnings":[]}',
      "Opérations autorisées :",
      '- set : {"op":"set","target":{"kind":"param","path":"..."},"value":...} pour un paramètre.',
      '- set : {"op":"set","target":{"kind":"collectionItemField","collection":"...","itemKey":"...","itemId":"...","field":"..."},"value":...} pour un champ.',
      '- remove : {"op":"remove","target":{"kind":"collectionItem",...}} pour supprimer la cible.',
      '- duplicate : {"op":"duplicate","target":{"kind":"collectionItem",...}}.',
      '- insertChild : {"op":"insertChild","parent":{...},"child":{"collection":"...","kind":"...","slot":"...","values":{...}}} uniquement si une règle d’insertion existe.',
      '- insert avec bindTo : {"op":"insert","target":{"kind":"collection","collection":"..."},"values":{...},"bindTo":{"target":{"kind":"collectionItemField","collection":"...","itemKey":"...","itemId":"...","field":"..."}}} pour créer une copie locale et la rattacher.',
      "Pour une suppression, utilise exactement la cible sélectionnée avec remove.",
      "Un style partagé ne doit jamais être modifié directement. Si la demande concerne une couleur, un fond ou un style, crée un nouveau style_profile avec insert + bindTo vers le champ de référence de la cible.",
      "Ne modifie que ce qui est nécessaire à la demande.",
    ].join("\n"),
    user: [
      `Demande : ${input.request}`,
      `Page courante : ${input.page === null ? "aucune" : `${input.page.label} (${input.page.pageId})`}`,
      `Cible : ${JSON.stringify(target)}`,
      `Champ courant : ${JSON.stringify(item)}`,
      `Collection : ${JSON.stringify(collection ?? null)}`,
      `Schéma de collection : ${JSON.stringify(collectionSchema ?? null)}`,
      `Règles d’insertion : ${JSON.stringify(rules)}`,
      `Références de style : ${JSON.stringify(styles)}`,
      `Skills du template : ${(() => {
        const serialized = JSON.stringify(
          input.skills.map((skill) => ({
            id: skill.id,
            version: skill.version,
            instructions: skill.instructions,
            examples: skill.examples,
            constraints: skill.operations.constraints,
          })),
        );
        return serialized.length > 12_000 ? `${serialized.slice(0, 12_000)}…` : serialized;
      })()}`,
    ].join("\n\n"),
  };
}
