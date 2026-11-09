import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ChatLink } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
  buildGuidedChatbotPrompt,
  type ChatbotConfig,
  type FicheDefinition,
} from "@/domain/entities/chatbot-config";
import { buildFieldsGuide } from "@/domain/field-guide";
import { canonicalMultiValue, canonicalOption } from "@/domain/field-options";

/** Consigne opérationnelle du mode de collecte semi-heuristique (ADR-0082). */
export const SEMI_HEURISTIC_COLLECTION_INSTRUCTION = [
  "Mode de collecte semi-heuristique :",
  "- Ne collecte pas les champs un par un dans la conversation.",
  "- Présente brièvement le formulaire et invite le visiteur à cliquer sur « Remplir le formulaire ».",
  "- Explique les champs, leurs options et leur utilité à la demande.",
  "- Si le visiteur donne des informations en texte, refuse poliment et demande-lui de remplir le formulaire.",
  "- Ne prétends jamais que la fiche est complète avant le remplissage du formulaire.",
  "- N'affiche jamais les noms techniques des champs.",
].join("\n");

function collectionInstruction(config: ChatbotConfig): string {
  return config.collectionMode === "semi_heuristic" ? SEMI_HEURISTIC_COLLECTION_INSTRUCTION : "";
}

/** Configuration courante d'un lien (ADR-0049), lue via `current_config_id`. */
export async function resolveCurrentConfig(
  configs: ChatbotConfigRepository | undefined,
  organizationId: string,
  link: Pick<ChatLink, "currentConfigId">,
): Promise<ChatbotConfig | null> {
  if (configs === undefined) return null;
  const id = link.currentConfigId ?? null;
  if (id === null || id === "") return null;
  return configs.findById(organizationId, id);
}

/** Fiche principale (première déclarée) d'une configuration. */
export function primaryFiche(config: ChatbotConfig): FicheDefinition | null {
  return config.fiches[0] ?? null;
}

export function findFiche(config: ChatbotConfig, key: string): FicheDefinition | null {
  return config.fiches.find((fiche) => fiche.key === key) ?? null;
}

/** Normalise les valeurs d'une instance selon les types de champs de sa fiche. */
function childFiche(fiche: FicheDefinition, key: string): FicheDefinition | undefined {
  return fiche.subFiches?.find((entry) => entry.key === key);
}

export function normalizeFicheData(
  fiche: FicheDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fiche.fields) {
    if (!Object.hasOwn(input, field.name)) continue;
    const value = input[field.name];
    if (value === null || value === undefined) continue;
    if (field.type === "file") continue;
    if (field.type === "fiche" || field.type === "tableau_de_fiches") {
      const child = field.ficheKey === undefined ? undefined : childFiche(fiche, field.ficheKey);
      if (child === undefined) continue;
      if (field.type === "fiche") {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          const normalizedChild = normalizeFicheData(child, value as Record<string, unknown>);
          if (Object.keys(normalizedChild).length > 0) output[field.name] = normalizedChild;
        }
        continue;
      }
      if (Array.isArray(value)) {
        const rows = value
          .filter(
            (row): row is Record<string, unknown> =>
              row !== null && typeof row === "object" && !Array.isArray(row),
          )
          .map((row) => normalizeFicheData(child, row))
          .filter((row) => Object.keys(row).length > 0);
        if (rows.length > 0) output[field.name] = rows;
      }
      continue;
    }
    if (field.type === "multi") {
      const { values, invalid } = canonicalMultiValue(field, value);
      const merged = [...values, ...invalid];
      if (merged.length > 0) output[field.name] = merged;
      continue;
    }
    if (typeof value === "number" && field.type === "number") {
      output[field.name] = value;
      continue;
    }
    const normalized =
      typeof value === "string"
        ? value.trim()
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : "";
    if (normalized === "") continue;
    if (field.type === "select") {
      output[field.name] = canonicalOption(field, normalized) ?? normalized;
      continue;
    }
    output[field.name] = normalized;
  }
  return output;
}

function fieldsGuide(fiche: FicheDefinition, depth = 0): string {
  const prefix = depth === 0 ? "" : `${"  ".repeat(depth)}Sous-fiche `;
  const lines: string[] = [];
  if (depth > 0) lines.push(`${prefix}"${fiche.label}" (${fiche.key}) :`);
  const guide = buildFieldsGuide(fiche.fields, {
    label:
      depth === 0 ? "Informations à collecter pour cette fiche :" : "  Champs de la sous-fiche :",
    includeTechnicalNames: false,
  });
  if (guide !== "") lines.push(guide);
  for (const field of fiche.fields) {
    if (field.type !== "fiche" && field.type !== "tableau_de_fiches") continue;
    const child =
      field.ficheKey === undefined
        ? undefined
        : fiche.subFiches?.find((entry) => entry.key === field.ficheKey);
    if (child !== undefined) lines.push(fieldsGuide(child, depth + 1));
  }
  return lines.join("\n");
}

/**
 * Construit la définition runtime d'une fiche de collecte. En mode guidé, le
 * prompt est généré depuis les réglages simples ; en mode expert, le prompt
 * saisi est la seule source. Les instructions de la fiche sont toujours
 * ajoutées séparément. Réutilise le moteur de champs/rendu existant.
 */
/**
 * Définition runtime d'un chatbot sans fiche de collecte : mode présentation /
 * information uniquement. Aucun champ, aucune génération de fiche.
 */
export function conversationOnlyDefinition(config: ChatbotConfig): TemplateDefinition {
  const systemPrompt =
    config.behaviorMode === "expert"
      ? config.systemPrompt.trim()
      : buildGuidedChatbotPrompt(config.simple);
  return {
    key: "presentation",
    label: config.simple.role.trim() === "" ? "Assistant" : config.simple.role.trim(),
    description: "",
    systemPrompt: [systemPrompt, collectionInstruction(config)]
      .filter((part) => part !== "")
      .join("\n\n"),
    fields: [],
    renderTemplate: "",
    simple: config.simple,
  };
}

export function ficheToDefinition(
  config: ChatbotConfig,
  fiche: FicheDefinition,
): TemplateDefinition {
  const basePrompt =
    config.behaviorMode === "expert"
      ? config.systemPrompt.trim()
      : buildGuidedChatbotPrompt(config.simple);
  const blocks: string[] = basePrompt === "" ? [] : [basePrompt];

  const ficheBlock: string[] = [`Fiche de collecte : ${fiche.label} (${fiche.key}).`];
  if (fiche.description.trim() !== "") ficheBlock.push(fiche.description.trim());
  if (fiche.intent.trim() !== "") ficheBlock.push(`Intention : ${fiche.intent.trim()}`);
  if (fiche.instructions.trim() !== "") ficheBlock.push(fiche.instructions.trim());
  const guide = fieldsGuide(fiche);
  const hasGuidePlaceholder = basePrompt.includes("{{champs_guide}}");
  if (!hasGuidePlaceholder && guide !== "") ficheBlock.push(guide);
  blocks.push(ficheBlock.join("\n"));
  const instruction = collectionInstruction(config);
  if (instruction !== "") blocks.push(instruction);

  return {
    key: fiche.key,
    label: fiche.label,
    description: fiche.description,
    systemPrompt: blocks.filter((block) => block !== "").join("\n\n"),
    fields: fiche.fields,
    ...(fiche.subFiches === undefined
      ? {}
      : { subFiches: fiche.subFiches.map((child) => ficheToDefinition(config, child)) }),
    renderTemplate: fiche.renderTemplate,
    simple: config.simple,
  };
}
