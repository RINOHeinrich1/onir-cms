import { NotFoundError, UnprocessableError } from "@/application/errors";
import type { AiClient, AiMessage } from "@/application/ports/ai-client";
import type { AiExtractionClient } from "@/application/ports/ai-client-factory";
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
  // Les champs fichier ne sont jamais extraits par l'IA (ADR-0034).
  const fields = definition.fields.filter((field) => field.type !== "file");
  const keys = fields.map((field) => `"${field.name}"`).join(", ");
  const rules = fields.map((field) => {
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
 * Extrait un objet JSON d'une réponse IA, même si le modèle l'a entouré de
 * texte ou d'un bloc Markdown. Retourne `null` si aucun JSON exploitable.
 */
export function parseExtractionJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1] !== undefined) candidates.push(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Essai suivant.
    }
  }
  return null;
}

function normalizeDraft(definition: TemplateDefinition, parsed: unknown): Record<string, unknown> {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const source = parsed as Record<string, unknown>;
  const draft: Record<string, unknown> = {};
  for (const field of definition.fields) {
    if (field.type === "file") continue;
    const value = source[field.name];
    if (field.type === "multi") {
      if (Array.isArray(value)) {
        const list = value.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
        );
        if (list.length > 0) draft[field.name] = list;
      }
      continue;
    }
    if (typeof value === "string" && value.trim() !== "") {
      draft[field.name] = value.trim();
    }
  }
  return draft;
}

async function extractWithClient(
  client: AiClient,
  definition: TemplateDefinition,
  messages: AiMessage[],
): Promise<Record<string, unknown>> {
  const system = buildExtractionGuide(definition);
  const extractionRequest: AiMessage = {
    role: "user",
    content:
      "Extrais maintenant les informations de cette conversation. Réponds uniquement avec un objet JSON strict, sans texte autour, sans markdown.",
  };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await client.complete({
        system,
        messages:
          attempt === 0
            ? [...messages, extractionRequest]
            : [
                ...messages,
                extractionRequest,
                {
                  role: "user",
                  content:
                    "La réponse précédente n'était pas un JSON valide. Réponds maintenant uniquement avec un objet JSON strict, sans texte, sans markdown.",
                },
              ],
        maxTokens: attempt === 0 ? 1_200 : 2_000,
        reasoning: "disabled",
        structured: true,
      });
      const parsed = parseExtractionJson(raw);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return normalizeDraft(definition, parsed);
      }
      lastError = new UnprocessableError(
        "L'IA n'a pas pu structurer les informations à partir de la conversation.",
      );
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof UnprocessableError) throw lastError;
  if (lastError instanceof Error && /réponse ia vide/i.test(lastError.message)) {
    throw new UnprocessableError(
      "Le modèle n'a pas renvoyé de contenu final (raisonnement bloqué ou limite de tokens).",
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new UnprocessableError("Extraction IA impossible.");
}

/**
 * Extrait les champs avec une chaîne de clients (extraction, secours, lien).
 * Chaque client tente deux fois : réponse normale, puis consigne corrective.
 */
export async function draftTemplateDataWithClients(
  deps: Pick<DraftTemplateDependencies, "conversations">,
  clients: readonly AiExtractionClient[],
  organizationId: string,
  conversationId: string,
  definition: TemplateDefinition,
): Promise<Record<string, unknown>> {
  const conversation = await deps.conversations.findById(organizationId, conversationId);
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  const messages = await deps.conversations.listMessages(organizationId, conversationId);
  if (messages.length === 0) throw new NotFoundError("Conversation vide");
  if (definition.fields.filter((field) => field.type !== "file").length === 0) return {};

  const mapped = messages.map((message) => ({
    role: message.role === "user" ? ("user" as const) : ("assistant" as const),
    content: message.content,
  }));
  let lastError: unknown = null;
  for (const entry of clients) {
    try {
      return await extractWithClient(entry.client, definition, mapped);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new UnprocessableError("Extraction IA impossible.");
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
  return draftTemplateDataWithClients(
    deps,
    [{ label: "lien", client: deps.ai }],
    organizationId,
    conversationId,
    definition,
  );
}
