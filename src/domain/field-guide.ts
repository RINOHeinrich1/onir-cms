import type { TemplateField } from "@/domain/entities/chat-template";

function formatHint(field: TemplateField): string {
  switch (field.type) {
    case "email":
      return "format email";
    case "url":
      return "format URL http(s)";
    case "file":
      return "pièce jointe à demander";
    case "select":
      return "une seule valeur";
    case "multi":
      return "une ou plusieurs valeurs";
    default:
      return "";
  }
}

function optionsHint(field: TemplateField): string {
  if ((field.type === "select" || field.type === "multi") && (field.options?.length ?? 0) > 0) {
    return `valeurs autorisées : ${field.options?.join(" | ")}`;
  }
  return "";
}

/**
 * Guide unique des champs, utilisé par le prompt conversationnel ET par
 * l'extraction. Il expose obligatoire, format, valeurs autorisées et exemple.
 */
export function buildFieldsGuide(
  fields: readonly TemplateField[],
  options: { label?: string } = {},
): string {
  const lines = fields.map((field) => {
    const required = field.required
      ? "obligatoire"
      : field.requiredIf !== undefined
        ? `obligatoire si ${field.requiredIf.field} vaut « ${field.requiredIf.equals} »`
        : "facultatif";
    const parts = [
      `${field.label} [${field.name}]`,
      required,
      field.type,
      formatHint(field),
      optionsHint(field),
      field.example !== undefined && field.example.trim() !== ""
        ? `exemple : ${field.example.trim()}`
        : "",
    ].filter((part) => part !== "");
    return `- ${parts.join(" — ")}`;
  });
  if (lines.length === 0) return "";
  return [
    options.label ?? "Informations à collecter :",
    ...lines,
    "",
    "Règles de collecte :",
    "- Utilise EXACTEMENT une des valeurs autorisées, en respectant la casse.",
    "- Si la réponse ne correspond à aucune valeur autorisée, demande une précision ou choisis « Autre » en conservant le détail dans le champ texte adapté.",
    "- N'invente jamais de valeur.",
    "- Ne dis jamais que tout est complet tant que tous les champs obligatoires ne sont pas présents et valides.",
    "- Pose une question à la fois.",
  ].join("\n");
}
