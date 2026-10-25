import type { Attachment } from "@/domain/entities/attachment";
import type { TemplateField } from "@/domain/entities/chat-template";

/**
 * Contexte des pièces jointes injecté au modèle (ADR-0034).
 * Seuls les libellés, statuts et noms de fichiers sont transmis : jamais le
 * contenu binaire, jamais un texte extrait.
 */
export function buildAttachmentPromptContext(
  fields: readonly TemplateField[],
  attachments: readonly Attachment[],
): string {
  const fileFields = fields.filter((field) => field.type === "file");
  if (fileFields.length === 0) return "";

  const byField = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const current = byField.get(attachment.fieldName) ?? [];
    current.push(attachment);
    byField.set(attachment.fieldName, current);
  }

  const lines = fileFields.map((field) => {
    const files = byField.get(field.name) ?? [];
    const required = field.required
      ? "obligatoire"
      : field.requiredIf !== undefined
        ? `obligatoire si ${field.requiredIf.field} = « ${field.requiredIf.equals} »`
        : "facultatif";
    const state =
      files.length === 0
        ? "manquant"
        : `reçu (${files.map((file) => file.originalName).join(", ")})`;
    return `- ${field.label} (${required}) : ${state}`;
  });

  return [
    "## Pièces jointes de prospection",
    "Ces informations sont des métadonnées : le contenu des fichiers n'est pas analysé.",
    ...lines,
    "",
    "Quand un champ fichier obligatoire manque, demande-le explicitement au prospect et indique-lui le bouton de pièce jointe correspondant. Ne prétends jamais avoir lu ou analysé un fichier.",
  ].join("\n");
}
