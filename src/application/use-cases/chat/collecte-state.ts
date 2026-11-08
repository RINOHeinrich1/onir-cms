import type { TemplateField } from "@/domain/entities/chat-template";
import { isFieldEmpty, isFieldRequired } from "@/domain/entities/conversation-field";
import { canonicalMultiValue, canonicalOption } from "@/domain/field-options";

/**
 * État de collecte injecté dans le prompt. Il ne doit exposer que les libellés
 * visibles : les noms techniques restent internes à l'extraction et au stockage.
 */
export function buildCollecteState(
  fields: readonly TemplateField[],
  data: Record<string, unknown>,
): string {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const field of fields) {
    if (field.type === "file") continue;
    if (field.type === "multi") {
      const { invalid: bad } = canonicalMultiValue(field, data[field.name]);
      if (bad.length > 0) invalid.push(`${field.label} (${bad.join(", ")})`);
      if (isFieldRequired(field, data) && isFieldEmpty(field, data[field.name])) {
        missing.push(field.label);
      }
      continue;
    }
    if (field.type === "select") {
      const value = data[field.name];
      if (
        typeof value === "string" &&
        value.trim() !== "" &&
        canonicalOption(field, value) === null
      ) {
        invalid.push(`${field.label} (${value})`);
      }
      if (isFieldRequired(field, data) && isFieldEmpty(field, value)) {
        missing.push(field.label);
      }
      continue;
    }
    if (isFieldRequired(field, data) && isFieldEmpty(field, data[field.name])) {
      missing.push(field.label);
    }
  }
  if (missing.length === 0 && invalid.length === 0) return "";
  return [
    "État de collecte actuel (source structurée, pas ton résumé) :",
    invalid.length > 0 ? `- Valeurs invalides à corriger : ${invalid.join(", ")}` : "",
    missing.length > 0 ? `- Champs obligatoires manquants : ${missing.join(", ")}` : "",
    "Ne dis pas que tout est complet tant que ces listes ne sont pas vides. Demande les informations manquantes une par une.",
    "Utilise uniquement les libellés visibles des champs, jamais leurs identifiants techniques.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
