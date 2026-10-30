import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ChatLink } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
  buildGuidedChatbotPrompt,
  type ChatbotConfig,
  type FicheDefinition,
} from "@/domain/entities/chatbot-config";

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
    if (field.type === "multi") {
      const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
      const normalized = list
        .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry).trim()))
        .filter((entry) => entry !== "");
      if (normalized.length > 0) output[field.name] = normalized;
      continue;
    }
    const normalized =
      typeof value === "string"
        ? value.trim()
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : "";
    if (normalized !== "") output[field.name] = normalized;
  }
  return output;
}

function fieldsGuide(fiche: FicheDefinition): string {
  const fields = fiche.fields.filter((field) => field.type !== "file");
  if (fields.length === 0) return "";
  const lines = fields.map((field) => {
    const required = field.required ? " (obligatoire)" : "";
    const example =
      field.example !== undefined && field.example.trim() !== ""
        ? ` — exemple : ${field.example.trim()}`
        : "";
    return `- ${field.label} [${field.name}]${required}${example}`;
  });
  return ["Informations à collecter pour cette fiche :", ...lines].join("\n");
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
    systemPrompt,
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
  if (guide !== "") ficheBlock.push(guide);
  blocks.push(ficheBlock.join("\n"));

  return {
    key: fiche.key,
    label: fiche.label,
    description: fiche.description,
    systemPrompt: blocks.filter((block) => block !== "").join("\n\n"),
    fields: fiche.fields,
    renderTemplate: fiche.renderTemplate,
    simple: config.simple,
  };
}
