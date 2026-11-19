import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import type { FicheInstanceStatus } from "@/domain/entities/conversation-fiche-instance";
import { isFieldEmpty, isFieldRequired } from "@/domain/entities/conversation-field";
import type { FicheWebhookEventType } from "@/domain/entities/webhook-event";

export type FicheTransitionState = {
  data: Record<string, unknown>;
  status: FicheInstanceStatus;
  attachmentCounts?: Readonly<Record<string, number>>;
};

export type FicheTransitionRequest = {
  allFields: boolean;
  requiredFields: boolean;
  fields: readonly string[];
  fieldGroups: readonly (readonly string[])[];
};

export type FicheTransitionEvent = {
  eventType: FicheWebhookEventType;
  fieldKey: string | null;
  fieldKeys?: string[] | null;
};

function fieldEmpty(
  field: TemplateField,
  data: Readonly<Record<string, unknown>>,
  attachmentCounts: Readonly<Record<string, number>>,
): boolean {
  if (field.type === "file") return (attachmentCounts[field.name] ?? 0) === 0;
  return isFieldEmpty(field, data[field.name]);
}

function allFilled(definition: TemplateDefinition, state: FicheTransitionState): boolean {
  const counts = state.attachmentCounts ?? {};
  return definition.fields.every((field) => !fieldEmpty(field, state.data, counts));
}

function requiredFilled(definition: TemplateDefinition, state: FicheTransitionState): boolean {
  const counts = state.attachmentCounts ?? {};
  return definition.fields
    .filter((field) => isFieldRequired(field, state.data))
    .every((field) => !fieldEmpty(field, state.data, counts));
}

/**
 * Compare deux états d'une même instance et retourne uniquement les
 * transitions réellement franchies. Un événement n'est jamais émis pour une
 * instance abandonnée.
 */
export function evaluateFicheTransitions(
  definition: TemplateDefinition,
  before: FicheTransitionState,
  after: FicheTransitionState,
  requested: FicheTransitionRequest,
): FicheTransitionEvent[] {
  if (after.status === "abandoned") return [];
  const events: FicheTransitionEvent[] = [];

  if (requested.allFields && !allFilled(definition, before) && allFilled(definition, after)) {
    events.push({
      eventType: "fiche.draft.all_fields_filled",
      fieldKey: null,
      fieldKeys: null,
    });
  }
  if (
    requested.requiredFields &&
    !requiredFilled(definition, before) &&
    requiredFilled(definition, after)
  ) {
    events.push({
      eventType: "fiche.draft.required_fields_filled",
      fieldKey: null,
      fieldKeys: null,
    });
  }
  for (const fieldName of requested.fields) {
    const field = definition.fields.find((entry) => entry.name === fieldName);
    if (field === undefined) continue;
    const beforeEmpty =
      field.type === "file"
        ? (before.attachmentCounts?.[field.name] ?? 0) === 0
        : isFieldEmpty(field, before.data[field.name]);
    const afterEmpty =
      field.type === "file"
        ? (after.attachmentCounts?.[field.name] ?? 0) === 0
        : isFieldEmpty(field, after.data[field.name]);
    if (beforeEmpty && !afterEmpty) {
      events.push({
        eventType: "fiche.draft.field_filled",
        fieldKey: field.name,
        fieldKeys: null,
      });
    }
  }
  for (const group of requested.fieldGroups) {
    const fieldsInGroup = group
      .map((fieldName) => definition.fields.find((entry) => entry.name === fieldName))
      .filter((field): field is TemplateField => field !== undefined);
    if (fieldsInGroup.length !== group.length || fieldsInGroup.length === 0) continue;
    const beforeAll = fieldsInGroup.every((field) =>
      field.type === "file"
        ? (before.attachmentCounts?.[field.name] ?? 0) > 0
        : !isFieldEmpty(field, before.data[field.name]),
    );
    const afterAll = fieldsInGroup.every((field) =>
      field.type === "file"
        ? (after.attachmentCounts?.[field.name] ?? 0) > 0
        : !isFieldEmpty(field, after.data[field.name]),
    );
    if (!beforeAll && afterAll) {
      events.push({
        eventType: "fiche.draft.fields_filled",
        fieldKey: null,
        fieldKeys: [...group],
      });
    }
  }
  return events;
}
