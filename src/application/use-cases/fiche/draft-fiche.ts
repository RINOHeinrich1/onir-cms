import { NotFoundError, UnprocessableError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { TemplateDefinition } from "@/domain/entities/chat-template";

export type DraftTemplateDependencies = {
  conversations: ConversationRepository;
  ai: AiClient;
};

/**
 * Construit le guide d'extraction JSON depuis les champs du modèle
 * (B007) : clés attendues + règles par champ, réponse JSON uniquement.
 */
export function buildExtractionGuide(definition: TemplateDefinition): string {
  const keys = definition.fields.map((field) => `"${field.name}"`).join(", ");
  const rules = definition.fields.map((field) => {
    const base =
      field.type === "multi"
        ? `${field.label} : tableau (plusieurs possibles parmi ${field.options?.join(", ") ?? "—"})`
        : field.type === "select"
          ? `${field.label} : "${field.options?.join('" ou "') ?? ""}" uniquement`
          : `${field.label}`;
    const suffix = field.required
      ? " (obligatoire)"
      : field.requiredIf
        ? ` (obligatoire si ${field.requiredIf.field} vaut "${field.requiredIf.equals}")`
        : "";
    const example =
      field.example !== undefined && field.example.trim() !== ""
        ? ` Exemple : "${field.example.trim()}".`
        : "";
    return `- ${base}${suffix}.${example}`;
  });

  return [
    "Analyse la conversation ci-dessous et extrais les informations au format JSON STRICT, sans texte autour, avec exactement ces clés :",
    `{${keys}}`,
    ...rules,
    "- Champs inconnus : chaîne vide (tableau vide pour les listes).",
    "- Ne réponds PAS au visiteur et n'écris aucun texte : ta seule sortie est le JSON.",
    "- Réponds UNIQUEMENT avec le JSON.",
  ].join("\n");
}

/**
 * Pré-remplissage assisté générique : l'IA propose les champs du modèle,
 * la validation métier tranche ensuite. Remplace `draftFicheFromConversation`.
 */
export async function draftTemplateDataFromConversation(
  deps: DraftTemplateDependencies,
  organizationId: string,
  conversationId: string,
  definition: TemplateDefinition,
): Promise<Record<string, unknown>> {
  const conversation = await deps.conversations.findById(organizationId, conversationId);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const messages = await deps.conversations.listMessages(organizationId, conversationId);
  if (messages.length === 0) {
    throw new NotFoundError("Conversation vide");
  }

  const raw = await deps.ai.complete({
    system: buildExtractionGuide(definition),
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UnprocessableError(
      "L'IA n'a pas pu structurer la fiche à partir de la conversation. Réessayez ou poursuivez la discussion.",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const source = parsed as Record<string, unknown>;

  const draft: Record<string, unknown> = {};
  for (const field of definition.fields) {
    const value = source[field.name];
    if (field.type === "multi") {
      if (Array.isArray(value)) draft[field.name] = value;
      continue;
    }
    if (typeof value === "string" && value.trim() !== "") {
      draft[field.name] = value.trim();
    }
  }
  return draft;
}
