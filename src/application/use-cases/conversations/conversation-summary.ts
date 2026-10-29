import { type Actor, actorCan, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, UnprocessableError, ValidationError } from "@/application/errors";
import type { AiTokenUsage } from "@/application/ports/ai-client";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { ConversationSummaryRepository } from "@/application/ports/conversation-summary-repository";
import { withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import { fallbackAiClient } from "@/application/use-cases/ai/with-fallback";
import { assertTokenBudgetAvailable } from "@/application/use-cases/chat/chat-link-quota";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import type { ChatMessage } from "@/domain/entities/chat";
import type { ConversationSummaryRecord } from "@/domain/entities/conversation-summary";

export type ConversationSummaryDependencies = {
  conversations: ConversationRepository;
  operatorScopes: ChatOperatorScopeRepository;
  links: ChatLinkRepository;
  summaries: ConversationSummaryRepository;
  ai: AiClientFactory;
};

export type GenerateConversationSummaryInput = {
  providerId?: unknown;
  model?: unknown;
};

const MAX_TRANSCRIPT_MESSAGES = 120;
const MAX_TRANSCRIPT_CHARS = 24_000;
const MAX_MESSAGE_CHARS = 4_000;

const SUMMARY_SYSTEM_PROMPT = [
  "Tu résumes une conversation entre un visiteur et un assistant ou un opérateur.",
  "Rédige un résumé factuel, concis et utile, dans la langue principale de la conversation.",
  "Conserve la demande du visiteur, les informations importantes échangées, les engagements et les prochaines étapes.",
  "N'invente aucune information et ne t'adresse pas au visiteur.",
  "Ne mets pas de titre et ne réponds pas par une liste si le texte suffit.",
].join("\n");

function roleLabel(message: ChatMessage): string {
  if (message.role === "user") return "Visiteur";
  if (message.role === "operator") return "Opérateur";
  return "Assistant";
}

/** Construit un transcript borné pour éviter un prompt IA démesuré. */
export function buildSummaryTranscript(messages: readonly ChatMessage[]): string {
  const selected = messages.slice(-MAX_TRANSCRIPT_MESSAGES);
  const lines = selected
    .map(
      (message) => `${roleLabel(message)} : ${message.content.trim().slice(0, MAX_MESSAGE_CHARS)}`,
    )
    .filter((line) => line !== "");
  let transcript = lines.join("\n\n");
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = `[… début de conversation tronqué …]\n\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`;
  }
  return transcript;
}

function parseExplicitTarget(
  actor: Actor,
  input: GenerateConversationSummaryInput,
): { providerId: string; model: string } | null {
  const providerId = typeof input.providerId === "string" ? input.providerId.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (providerId === "" && model === "") return null;
  if (providerId === "" || model === "") {
    throw new ValidationError("Fournisseur et modèle doivent être fournis ensemble");
  }
  if (!actorCan(actor, "ai:assign")) {
    throw new ValidationError("Vous n'êtes pas autorisé à choisir un autre modèle IA");
  }
  return { providerId, model };
}

/** Lecture du résumé d'une conversation (lecteur inclus, scopé). */
export async function getConversationSummary(
  deps: ConversationSummaryDependencies,
  actor: Actor,
  conversationId: string,
): Promise<ConversationSummaryRecord | null> {
  assertCan(actor, "conversations:read");
  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const conversation = await deps.conversations.findById(
    organizationId,
    conversationId,
    allowedLinkIds,
  );
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  return deps.summaries.findByConversation(organizationId, conversationId);
}

/**
 * Génère ou écrase le résumé courant à la demande.
 * Le résumé est indépendant des fiches, mais les tokens consommés sont imputés
 * au chatbot comme les fiches (ADR-0048/0054).
 */
export async function generateConversationSummary(
  deps: ConversationSummaryDependencies,
  actor: Actor,
  conversationId: string,
  input: GenerateConversationSummaryInput = {},
): Promise<ConversationSummaryRecord> {
  assertCan(actor, "conversations:summarize");
  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const conversation = await deps.conversations.findById(
    organizationId,
    conversationId,
    allowedLinkIds,
  );
  if (conversation === null) throw new NotFoundError("Conversation introuvable");

  const link = await deps.links.findById(organizationId, conversation.linkId);
  if (link === null) throw new NotFoundError("Chatbot introuvable");

  assertTokenBudgetAvailable(link);

  const messages = await deps.conversations.listMessages(organizationId, conversationId);
  if (messages.length === 0) {
    throw new UnprocessableError("Conversation vide : aucun message à résumer");
  }

  const explicit = parseExplicitTarget(actor, input);
  const target = {
    organizationId,
    aiProviderId: explicit?.providerId ?? link.aiProviderId,
    aiModel: explicit?.model ?? link.aiModel,
  };
  const chain =
    deps.ai.forUsage === undefined
      ? [{ label: "response", client: await deps.ai.forTarget(target) }]
      : await deps.ai.forUsage(target, "summary", link.id);
  const client = fallbackAiClient(chain);
  const usageTotal = { tokens: 0 };
  const labelParts = chain[0]?.label.split(" · ") ?? [];
  const providerLabel = labelParts[1] ?? "configuré";
  const modelLabel = labelParts.slice(2).join(" · ") || "usage summary";
  const recordUsage = async (operation: string, usage: AiTokenUsage): Promise<void> => {
    usageTotal.tokens = usage.totalTokens;
    await deps.links.recordAiUsage?.(organizationId, link.id, {
      conversationId,
      operation,
      ...usage,
    });
  };

  const content = (
    await withAiUsage(client, recordUsage, "conversation_summary").complete({
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            "Voici la conversation à résumer :",
            "",
            buildSummaryTranscript(messages),
            "",
            "Rédige maintenant uniquement le résumé.",
          ].join("\n"),
        },
      ],
      maxTokens: 900,
      reasoning: "disabled",
    })
  ).trim();

  if (content === "") {
    throw new UnprocessableError("L'IA n'a pas produit de résumé exploitable");
  }

  const lastMessage = messages[messages.length - 1] ?? null;
  const sourceLastMessageAt = conversation.lastMessageAt ?? lastMessage?.createdAt ?? null;

  return deps.summaries.upsert(organizationId, conversationId, {
    content,
    provider: providerLabel,
    model: modelLabel,
    tokensUsed: usageTotal.tokens,
    sourceMessageCount: messages.length,
    sourceLastMessageAt,
    generatedWhileFinalized: conversation.statut === "finalisee",
    generatedBy: actor.id,
  });
}
