import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import { isFieldEmpty } from "@/domain/entities/conversation-field";
import type { WebhookFieldMapping, WebhookTrigger } from "@/domain/entities/webhook";
import type { FicheWebhookEventType } from "@/domain/entities/webhook-event";

export type WebhookPayloadContext = {
  data: Record<string, unknown>;
  attachmentCounts: Readonly<Record<string, number>>;
  conversationId: string | null;
  prospectId: string | null;
};

const ALWAYS_META = new Set(["id", "createdAt", "conversationId", "archivee"]);

function guaranteedFieldNames(
  eventType: FicheWebhookEventType,
  definition: TemplateDefinition,
  fieldKey: string | null,
  fieldKeys: readonly string[] | null | undefined,
): Set<string> {
  const all = new Set(definition.fields.map((field) => field.name));
  if (eventType === "fiche.draft.all_fields_filled") return all;
  if (eventType === "fiche.draft.field_filled") return new Set(fieldKey === null ? [] : [fieldKey]);
  if (eventType === "fiche.draft.fields_filled") return new Set(fieldKeys ?? []);
  // Les champs conditionnels ne sont pas garantis pour un événement générique.
  const required = definition.fields
    .filter((field) => field.required && field.requiredIf === undefined)
    .map((field) => field.name);
  return new Set(required);
}

function mappingGuaranteed(
  mapping: WebhookFieldMapping,
  eventType: FicheWebhookEventType,
  definition: TemplateDefinition,
  fieldKey: string | null,
  fieldKeys: readonly string[] | null | undefined,
): boolean {
  const fields = guaranteedFieldNames(eventType, definition, fieldKey, fieldKeys);
  if (mapping.source === "field" || mapping.source === "attachment") {
    return fields.has(mapping.field);
  }
  if (mapping.source === "meta") return ALWAYS_META.has(mapping.field);
  return false;
}

/** Retourne les mappings requis non garantis par les triggers configurés. */
export function missingRequiredMappings(
  triggers: readonly WebhookTrigger[],
  mappings: readonly WebhookFieldMapping[],
  definition: TemplateDefinition,
): Array<{ trigger: string; field: string }> {
  const missing: Array<{ trigger: string; field: string }> = [];
  for (const trigger of triggers) {
    for (const mapping of mappings) {
      if (!mapping.required) continue;
      if (
        mappingGuaranteed(
          mapping,
          trigger.eventType,
          definition,
          trigger.fieldKey,
          trigger.fieldKeys,
        )
      ) {
        continue;
      }
      missing.push({ trigger: trigger.eventType, field: mapping.field });
    }
  }
  return missing;
}

function fieldEmpty(field: TemplateField, context: WebhookPayloadContext): boolean {
  if (field.type === "file") return (context.attachmentCounts[field.name] ?? 0) === 0;
  return isFieldEmpty(field, context.data[field.name]);
}

function metaMissing(field: string, context: WebhookPayloadContext): boolean {
  if (field === "conversationId") return context.conversationId === null;
  if (field === "prospectId") return context.prospectId === null;
  if (field === "id" || field === "createdAt" || field === "archivee") return false;
  return true;
}

/** Garde runtime : mappings requis encore absents dans le snapshot. */
export function missingRequiredPayloadMappings(
  mappings: readonly WebhookFieldMapping[],
  definition: TemplateDefinition,
  context: WebhookPayloadContext,
): string[] {
  const missing: string[] = [];
  for (const mapping of mappings) {
    if (!mapping.required) continue;
    if (mapping.source === "field" || mapping.source === "attachment") {
      const field = definition.fields.find((entry) => entry.name === mapping.field);
      if (field === undefined || fieldEmpty(field, context)) missing.push(mapping.field);
    } else if (mapping.source === "meta") {
      if (metaMissing(mapping.field, context)) missing.push(mapping.field);
    } else if (mapping.source === "prospect") {
      if (context.prospectId === null) missing.push(mapping.field);
    }
  }
  return [...new Set(missing)];
}
