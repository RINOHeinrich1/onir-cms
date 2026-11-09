import type { TemplateField } from "@/domain/entities/chat-template";
import type { MessageBlock } from "@/domain/tool-blocks";

export type FieldLabelMap = Record<string, string>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mapping nom technique → libellé visible, limité aux champs réellement connus. */
export function fieldLabelsFromFields(fields: readonly TemplateField[]): FieldLabelMap {
  const labels: FieldLabelMap = {};
  for (const field of fields) {
    const name = field.name.trim();
    if (name === "" || Object.hasOwn(labels, name)) continue;
    labels[name] = field.label.trim() === "" ? name : field.label.trim();
  }
  return labels;
}

/**
 * Retire les identifiants techniques connus des réponses assistant.
 * Ne touche jamais aux valeurs métier ni aux crochets inconnus.
 */
export function sanitizeAssistantContent(content: string, fieldLabels: FieldLabelMap): string {
  let result = content;
  for (const [name, label] of Object.entries(fieldLabels)) {
    if (name === "" || label === "") continue;
    const technicalName = escapeRegExp(name);
    const visibleLabel = escapeRegExp(label);
    result = result.replace(
      new RegExp(`${visibleLabel}\\s*\\[\\s*${technicalName}\\s*\\]`, "gi"),
      () => label,
    );
    result = result.replace(new RegExp(`\\[\\s*${technicalName}\\s*\\]`, "gi"), () => label);
  }
  return result;
}

/** Nettoie l'historique envoyé au modèle sans modifier les messages utilisateur. */
export function sanitizeAssistantHistory<T extends { role: string; content: string }>(
  messages: readonly T[],
  fieldLabels: FieldLabelMap,
): T[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? { ...message, content: sanitizeAssistantContent(message.content, fieldLabels) }
      : message,
  );
}

/** Nettoie les blocs texte d'un message assistant, sans toucher aux cartes d'outils. */
export function sanitizeAssistantBlocks(
  blocks: readonly MessageBlock[],
  fieldLabels: FieldLabelMap,
): MessageBlock[] {
  return blocks.map((block) =>
    block.type === "text"
      ? { ...block, text: sanitizeAssistantContent(block.text, fieldLabels) }
      : block,
  );
}
