/**
 * Validation du schéma déclaratif d'un modèle (B001) — fonctions pures.
 * Un modèle décrit ses champs : `{ name, label, type, required, options?,
 * requiredIf?, example? }` avec `type ∈ text|textarea|select|multi|url|email`
 * et **au plus une** règle `requiredIf` (champ requis si un autre vaut X).
 */

import { normalizeFileConstraints } from "@/domain/entities/attachment";
import {
  isTemplateFieldType,
  type TemplateDefinition,
  type TemplateField,
} from "@/domain/entities/chat-template";

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Valide une définition brute (JSON du marketeur) et renvoie la définition
 * normalisée, ou la liste des erreurs (affichables telles quelles).
 */
export function validateTemplateDefinition(
  input: unknown,
): { ok: true; value: TemplateDefinition } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["Définition invalide"] };
  }

  const key = text(input.key);
  if (!KEY_PATTERN.test(key)) {
    errors.push("Clé invalide (minuscules, chiffres et tirets, ex. « fiche-projet »)");
  }
  const label = text(input.label);
  if (label === "") errors.push("Libellé obligatoire");
  const systemPrompt = text(input.systemPrompt);
  if (systemPrompt === "") errors.push("Prompt système obligatoire");
  const renderTemplate = text(input.renderTemplate);
  if (renderTemplate === "") errors.push("Modèle de rendu obligatoire");

  const fields: TemplateField[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    errors.push("Au moins un champ est requis");
  } else {
    for (const raw of input.fields) {
      if (!isRecord(raw)) {
        errors.push("Champ invalide");
        continue;
      }
      const name = text(raw.name);
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
        errors.push("Nom de champ invalide (lettres, chiffres, _)");
        continue;
      }
      if (seen.has(name)) {
        errors.push(`Champ en double : ${name}`);
        continue;
      }
      seen.add(name);
      const fieldLabel = text(raw.label);
      if (fieldLabel === "") {
        errors.push(`Libellé obligatoire (champ ${name})`);
        continue;
      }
      const typeRaw = text(raw.type);
      if (!isTemplateFieldType(typeRaw)) {
        errors.push(`Type invalide (champ ${name})`);
        continue;
      }
      const example = text(raw.example);
      const field: TemplateField = {
        name,
        label: fieldLabel,
        type: typeRaw,
        required: raw.required === true,
        ...(example === "" ? {} : { example }),
      };
      if (typeRaw === "file") {
        const constraints = normalizeFileConstraints(raw.file);
        if (!constraints.ok) {
          errors.push(`${constraints.error} (champ ${name})`);
          continue;
        }
        field.file = constraints.value;
      }
      if (typeRaw === "select" || typeRaw === "multi") {
        const options = Array.isArray(raw.options)
          ? raw.options.filter(
              (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
            )
          : [];
        if (options.length === 0) {
          errors.push(`Options requises (champ ${name})`);
          continue;
        }
        field.options = options;
      }
      if (raw.requiredIf !== undefined) {
        if (!isRecord(raw.requiredIf)) {
          errors.push(`Règle conditionnelle invalide (champ ${name})`);
          continue;
        }
        const target = text(raw.requiredIf.field);
        const equals = text(raw.requiredIf.equals);
        if (target === "" || equals === "") {
          errors.push(`Règle conditionnelle incomplète (champ ${name})`);
          continue;
        }
        field.requiredIf = { field: target, equals };
      }
      fields.push(field);
    }
  }

  // Les cibles des `requiredIf` doivent exister ; une seule règle au total.
  const names = new Set(fields.map((field) => field.name));
  const conditional = fields.filter((field) => field.requiredIf !== undefined);
  for (const field of conditional) {
    if (!names.has(field.requiredIf?.field ?? "")) {
      errors.push(
        `Règle conditionnelle du champ « ${field.label} » vers un champ inexistant (${field.requiredIf?.field ?? ""})`,
      );
    }
  }
  if (conditional.length > 1) {
    errors.push("Une seule règle conditionnelle par modèle");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      key,
      label,
      description: text(input.description),
      systemPrompt,
      fields,
      renderTemplate,
    },
  };
}
